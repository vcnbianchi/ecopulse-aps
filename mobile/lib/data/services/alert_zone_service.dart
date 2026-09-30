import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

class AlertZone {
  final LatLng center;
  final double radiusKm;
  final String category;
  final int severity;
  final String message;

  const AlertZone({
    required this.center,
    required this.radiusKm,
    required this.category,
    required this.severity,
    required this.message,
  });

  static AlertZone? fromPayload(Map<dynamic, dynamic>? payload) {
    if (payload == null) return null;
    final lat = double.tryParse('${payload['lat']}');
    final lng = double.tryParse('${payload['lng']}');
    if (lat == null || lng == null) return null;

    return AlertZone(
      center: LatLng(lat, lng),
      radiusKm: double.tryParse('${payload['radiusKm']}') ?? 1.0,
      category: '${payload['category'] ?? 'Risco'}',
      severity: int.tryParse('${payload['severity']}') ?? 3,
      message: '${payload['message'] ?? 'Perigo detectado na região.'}',
    );
  }
}

class AlertZoneService {
  static final AlertZoneService _instance = AlertZoneService._internal();
  factory AlertZoneService() => _instance;
  AlertZoneService._internal();

  final ValueNotifier<AlertZone?> zone = ValueNotifier<AlertZone?>(null);
  final ValueNotifier<int> navigationRequests = ValueNotifier<int>(0);

  void showExclusionZone(AlertZone newZone) {
    zone.value = newZone;
    navigationRequests.value++;
  }

  void clear() {
    zone.value = null;
  }
}
