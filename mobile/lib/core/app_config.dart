import 'package:flutter/material.dart';

class AppConfig {
  AppConfig._();

  static const String host = '10.0.2.2';
  static const int port = 4500;

  static const String baseUrl = 'http://$host:$port';
  static const String wsUrl = 'ws://$host:$port';

  static const String reportsEndpoint = '$baseUrl/api/reports';
  static const String devicesRegisterEndpoint = '$baseUrl/api/devices/register';
}

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
