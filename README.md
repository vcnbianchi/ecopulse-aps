# EcoPulse

Plataforma distribuída mobile para **monitoramento colaborativo de riscos ambientais urbanos**
(alagamentos, ilhas de calor, poluição do ar). Os usuários reportam ocorrências pelo aplicativo
Flutter e recebem alertas de proximidade em tempo real, via WebSocket (app aberto) e push
notifications FCM (app fechado).

Projeto acadêmico de APS da disciplina de Desenvolvimento de Sistemas Distribuídos, tema
*"Desenvolvimento de uma aplicação de sistema distribuído para dispositivo móvel"*.

## Arquitetura

Arquitetura Orientada a Eventos (EDA) com microsserviços independentes que se comunicam
**exclusivamente via RabbitMQ** (nunca por HTTP entre si). Toda a troca de eventos passa por um
*topic exchange* (`ecopulse.events`) com routing keys hierárquicas.

```
 mobile (Flutter)
    │
    ▼
 api-gateway (nginx :4500)
    ├─ POST /api/reports ──────────► ingestion-service ──► report.ingested.p{N}
    ├─ GET  /api/reports ──────────► query-service (cache-aside Redis → PostGIS)
    ├─ POST /api/devices/register ─► notification-service
    └─ ws://                ───────► notification-service
                                                    │
                          RabbitMQ  ◄───────────────┘
                     ecopulse.events (topic)
                     ┌──────────────┬──────────────┬──────────────┐
             reports_partition_0 … reports_partition_3   (1 fila por quadrante geográfico)
                     └──────────────┴──────┬───────┴──────────────┘
                                           ▼
                        geo-processing-service (N réplicas / shards)
                        PostGIS (geohash + partition) + Redis (recent_reports, reports_geo)
                                           │ report.processed
                                           ▼
                                     alert-service  (regra: severity ≥ 3)
                                           │ alert.generated
                                           ▼
                                  notification-service
                                   ├─ WebSocket  → clientes conectados no raio (Haversine)
                                   └─ Push FCM   → dispositivos registrados no raio (Redis GEOSEARCH)
```

| Serviço | Pasta | Responsabilidade | Acessa |
|---|---|---|---|
| `api-gateway` | `gateway/` | Ponto único de entrada; roteia por path/método | – |
| `ingestion-service` | `backend/services/ingestion-service` | `POST /api/reports`: valida, calcula GeoHash/partição e publica `report.ingested.p{N}` | RabbitMQ |
| `query-service` | `backend/services/query-service` | `GET /api/reports` com cache-aside (lado de leitura, CQRS) | Redis, PostGIS |
| `geo-processing-service` | `backend/services/geo-processing-service` | Consome `reports_partition_N`, persiste, indexa, publica `report.processed` | RabbitMQ, PostGIS, Redis |
| `alert-service` | `backend/services/alert-service` | Regra de negócio de alerta; publica `alert.generated` | RabbitMQ |
| `notification-service` | `backend/services/notification-service` | Consome `alerts`; WebSocket + push FCM; `POST /api/devices/register` | RabbitMQ, PostGIS, Redis |
| `db-migrate` | `backend/shared` | Job one-shot que aplica as migrações Drizzle antes dos serviços subirem | PostGIS |

O código comum (broker, schema Drizzle, clientes de banco/cache, utilitários geo e contratos
de eventos) vive no pacote `@ecopulse/shared` (`backend/shared`), consumido via npm workspaces.

### Eventos

| Routing key | Produtor | Fila | Consumidor |
|---|---|---|---|
| `report.ingested.p{N}` | ingestion-service | `reports_partition_{N}` | geo-processing-service |
| `report.processed` | geo-processing-service | `reports_processed` | alert-service |
| `alert.generated` | alert-service | `alerts` | notification-service |

## Como executar

Pré-requisitos: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up -d --build
```

Endpoints (via gateway em `http://localhost:4500`):

```bash
curl -X POST http://localhost:4500/api/reports -H 'Content-Type: application/json' \
  -d '{"category":"Alagamento","severity":4,"description":"Rua alagada","latitude":-23.5505,"longitude":-46.6333}'

curl http://localhost:4500/api/reports
```

Portas úteis: RabbitMQ Management `http://localhost:15672` (guest/guest), PostGIS `5433`,
Redis `6380`. Os serviços também expõem portas diretas para depuração: ingestion `4501`,
query `4502`, notification `4503`.

## Particionamento geoespacial e escala horizontal

Cada relato recebe um **GeoHash** (precisão 9, ≈ 4,8 m) no momento da ingestão. O **prefixo**
do geohash (`PARTITION_PREFIX_LENGTH`, padrão 5 ≈ quadrante de 4,9 km × 4,9 km) passa por um
hash consistente (FNV-1a) módulo `PARTITION_COUNT` (padrão 4), definindo a partição. O evento
é publicado com routing key `report.ingested.p{N}` e cai na fila `reports_partition_{N}`.

Relatos geograficamente próximos caem sempre na mesma partição (localidade espacial), e
quadrantes diferentes são distribuídos entre as filas. O geohash e a partição ficam gravados
nas colunas `reports.geohash` (indexada) e `reports.partition`.

### Modo 1: réplicas concorrentes (balanceamento de carga)

```bash
docker compose up -d --scale geo-processing-service=3
```

Cada réplica consome **todas** as partições (`PARTITIONS=all`). O RabbitMQ distribui as
mensagens de cada fila entre as réplicas (round-robin entre consumidores), o que balanceia a
carga. No Management UI cada `reports_partition_N` mostra 3 consumidores.

### Modo 2: sharding estrito (um nó por quadrante)

```bash
docker compose -f docker-compose.yml -f docker-compose.sharded.yml up -d --build
```

Sobe `geo-processing-shard-0..3`, cada um com `PARTITIONS=N`, consumindo **apenas** a sua
partição, e escala o serviço genérico `geo-processing-service` para 0 réplicas (para que ele
não compita com os shards). Um nó é dono exclusivo de um conjunto de quadrantes geográficos.
Para voltar ao modo padrão: `docker compose up -d --remove-orphans`. Os logs mostram
`[GeoProcessing] Instance geo-shard-2 ... Assigned partitions: [2]` e
`[Worker:p2] Report inserted into PostgreSQL ...`.

Consulta útil para demonstrar a distribuição:

```sql
SELECT partition, COUNT(*), string_agg(DISTINCT left(geohash,5), ',')
FROM reports GROUP BY partition ORDER BY partition;
```

## Tolerância a falhas: retries com backoff exponencial + DLQ

Toda fila de trabalho tem uma Dead Letter Queue (`reports_dead_letter`,
`reports_processed_dead_letter`, `alerts_dead_letter`). Antes de uma mensagem cair na DLQ,
o consumidor aplica retries com backoff exponencial:

| Tentativa | Espera | Fila de retry |
|---|---|---|
| 1 | 2 s | `reports_retry_2000ms` |
| 2 | 4 s | `reports_retry_4000ms` |
| 3 | 8 s | `reports_retry_8000ms` |
| – | – | `reports_dead_letter` |

Implementação (`backend/shared/src/broker/rabbitmq.ts`): ao falhar, o consumidor republica a
mensagem no *headers exchange* `ecopulse.retry` com os headers `x-retry-count` e
`retry-delay-ms`; a fila de retry correspondente tem `x-message-ttl` e `x-dead-letter-exchange`
apontando de volta para `ecopulse.events`. Ao expirar, a mensagem volta **com a routing key
original**, isto é, para a mesma partição de onde saiu. Após `MAX_RETRIES` (padrão 3) ela é
rejeitada com `nack(msg, false, false)` e vai para a DLQ, preservando o comportamento original.

Contrato do handler: `return true` = ack; `return false` = mensagem inválida, vai direto para a
DLQ (*poison message*); `throw` = falha transitória, entra na política de retries.

Demonstração em sala (injeção de falhas):

```bash
FAULT_INJECTION=true docker compose up -d --no-deps ingestion-service
curl -X POST http://localhost:4500/api/reports -H 'Content-Type: application/json' \
  -d '{"category":"Alagamento","severity":2,"latitude":-23.55,"longitude":-46.63,"simulateFailure":true}'
docker compose logs -f geo-processing-service
```

Saída esperada:

```
[Worker:p3] Retry 1/3 for message 06be6a14-..., waiting 2000ms (queue=reports_partition_3)
[Worker:p3] Retry 2/3 for message 06be6a14-..., waiting 4000ms (queue=reports_partition_3)
[Worker:p3] Retry 3/3 for message 06be6a14-..., waiting 8000ms (queue=reports_partition_3)
[Worker:p3] Message 06be6a14-... exhausted 3 retries. Rejecting to DLQ.
```

## Push notifications (FCM)

1. Crie um projeto no Firebase e registre o app Android `com.ecopulse.ecopulse_mobile`.
2. **Backend**: baixe a chave da service account (Configurações do projeto → Contas de serviço)
   e salve em `firebase/service-account.json`. O diretório é montado no `notification-service`.
   Sem o arquivo, o serviço sobe com o push desabilitado (WebSocket continua funcionando).
3. **Mobile**: gere `mobile/lib/firebase_options.dart` com a FlutterFire CLI:
   ```bash
   cd mobile
   dart pub global activate flutterfire_cli
   flutterfire configure --platforms=android
   flutter run
   ```

Fluxo: o app obtém o token FCM, envia `{ deviceId, fcmToken, lat, lng }` para
`POST /api/devices/register` (tabela `devices` + índice `devices_geo` no Redis) e reenvia a
posição a cada 30 s junto com o `location_update` do WebSocket. Ao processar um
`alert.generated`, o `notification-service` faz `GEOSEARCH` por raio, busca os tokens no
PostgreSQL e envia uma mensagem *data-only* de alta prioridade. No app,
`FirebaseMessaging.onBackgroundMessage` exibe a notificação nativa
(`flutter_local_notifications`); tocar nela abre o mapa centralizado no alerta com o raio de
exclusão destacado.

## Aplicativo mobile

- Offline-first: relatos gravados em SQLite (`sync_status = pending`) e sincronizados
  automaticamente quando a conectividade volta (`connectivity_plus`).
- Mapa (`flutter_map` + OpenStreetMap) com marcadores por categoria e camadas ambientais
  derivadas da densidade de relatos: **Qualidade do ar (AQI)** (relatos de Poluição),
  **Ilhas de calor** (Ilha de Calor / Foco de Incêndio) e **Densidade geral**, alternáveis pelo
  menu de camadas.
- Alertas de proximidade via WebSocket e push FCM, com o botão **Ver rota alternativa** que
  destaca no mapa um raio de exclusão ao redor do ponto de risco (roteamento preventivo
  simplificado).
- Todas as chamadas usam o gateway em `10.0.2.2:4500` (alias do host no emulador Android),
  configurado em `mobile/lib/core/app_config.dart`.

## Variáveis de ambiente

Veja `.env.example`. As mais relevantes:

| Variável | Padrão | Descrição |
|---|---|---|
| `PARTITION_COUNT` | 4 | Número de filas `reports_partition_N` (igual em todos os serviços) |
| `PARTITION_PREFIX_LENGTH` | 5 | Tamanho do prefixo do GeoHash usado no roteamento |
| `PARTITIONS` | all | Partições consumidas por uma instância do geo-processing-service |
| `MAX_RETRIES` | 3 | Tentativas antes da DLQ |
| `RETRY_BASE_DELAY_MS` | 2000 | Base do backoff exponencial |
| `FAULT_INJECTION` | false | Habilita `simulateFailure` no `POST /api/reports` |
| `ALERT_MIN_SEVERITY` | 3 | Severidade mínima para gerar alerta |
| `ALERT_RADIUS_KM` | 5 | Raio de disseminação dos alertas |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | – | Caminho da service account no container |

## Desenvolvimento local (sem Docker para os serviços)

```bash
cd backend
npm install
npm run typecheck
npm run db:migrate            # usa POSTGRES_* do .env
npm run start:ingestion       # ou start:query, start:geo, start:alert, start:notification
```
