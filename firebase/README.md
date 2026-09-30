# Credenciais do Firebase (push notifications)

Coloque neste diretório o arquivo **`service-account.json`** da service account do seu
projeto Firebase (Console Firebase → Configurações do projeto → Contas de serviço →
*Gerar nova chave privada*).

O diretório é montado somente-leitura no container `notification-service`
(`/usr/src/app/firebase`). Se o arquivo não existir, o serviço sobe normalmente com o
canal de push **desabilitado** e os alertas continuam chegando via WebSocket.

> Arquivos `*.json` deste diretório são ignorados pelo Git (`.gitignore`). Nunca commite
> a chave privada.
