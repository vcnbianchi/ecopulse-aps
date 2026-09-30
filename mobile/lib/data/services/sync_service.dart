import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:connectivity_plus/connectivity_plus.dart';
import '../dao/report_dao.dart';
import '../../core/app_config.dart';

class SyncService {
  final ReportDao _reportDao = ReportDao();

  final String _apiUrl = AppConfig.reportsEndpoint;

  bool _isSyncing = false;


  void initializeNetworkListener() {
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {

      if (!results.contains(ConnectivityResult.none)) {
        syncPendingReports();
      }
    });
  }


  Future<void> syncPendingReports() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final pendingReports = await _reportDao.getPendingReports();

      if (pendingReports.isEmpty) {
        _isSyncing = false;
        return;
      }

      print('[SyncService] Encontrados ${pendingReports.length} relatos pendentes. Iniciando sync...');

      for (var report in pendingReports) {
        try {
          final response = await http.post(
            Uri.parse(_apiUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'category': report.category,
              'severity': report.severity,
              'description': report.description,
              'latitude': report.latitude,
              'longitude': report.longitude,
            }),
          );

          if (response.statusCode == 202 || response.statusCode == 200 || response.statusCode == 201) {
            print('[SyncService] Relato ID ${report.id} sincronizado com sucesso.');

            await _reportDao.markAsSynced(report.id!);
          } else {
            print('[SyncService] Falha ao sincronizar o relato ID ${report.id}. HTTP Status: ${response.statusCode}');
          }
        } catch (e) {
          print('[SyncService] Erro de conexão durante sync do relato ID ${report.id}: $e');

          break;
        }
      }
    } catch (e) {
      print('[SyncService] Erro geral na rotina de sincronização: $e');
    } finally {
      _isSyncing = false;
    }
  }
}
