import 'package:flutter/material.dart';

/// Configuração central do app.
///
/// Todas as rotas passam pelo API Gateway (nginx) na porta 4500, que encaminha cada
/// path para o microsserviço correto (ingestion, query, notification). Assim o app
/// continua enxergando um único host mesmo com o backend dividido em vários serviços.
///
/// `10.0.2.2` é o alias do host quando o app roda no emulador Android.
class AppConfig {
  AppConfig._();

  static const String host = '10.0.2.2';
  static const int port = 4500;

  static const String baseUrl = 'http://$host:$port';
  static const String wsUrl = 'ws://$host:$port';

  static const String reportsEndpoint = '$baseUrl/api/reports';
  static const String devicesRegisterEndpoint = '$baseUrl/api/devices/register';
}

/// Chave global do Navigator: permite que serviços em background (push, WebSocket)
/// exibam diálogos sem depender de um BuildContext específico.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
