import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import '../../core/app_config.dart';
import '../../data/services/alert_zone_service.dart';

enum MapLayerKind { markers, aqi, heatIsland, density, exclusionZone }

class _DensityCell {
  final LatLng center;
  final int count;
  final int maxSeverity;
  const _DensityCell(this.center, this.count, this.maxSeverity);
}

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final String _apiUrl = AppConfig.reportsEndpoint;
  final MapController _mapController = MapController();
  final AlertZoneService _alertZoneService = AlertZoneService();

  List<dynamic> _reports = [];
  List<Marker> _markers = [];
  bool _isLoading = true;
  bool _mapReady = false;
  LatLng _initialCenter = const LatLng(-23.5505, -46.6333);

  static const double _cellSizeDeg = 0.005;

  final Set<MapLayerKind> _enabledLayers = {
    MapLayerKind.markers,
    MapLayerKind.aqi,
    MapLayerKind.heatIsland,
    MapLayerKind.exclusionZone,
  };

  @override
  void initState() {
    super.initState();
    _alertZoneService.zone.addListener(_onAlertZoneChanged);
    _initializeApp();
  }

  @override
  void dispose() {
    _alertZoneService.zone.removeListener(_onAlertZoneChanged);
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _initializeApp() async {
    await _getUserLocation();
    await _fetchReports();
  }

  Future<void> _getUserLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) return;

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium)
      );

      setState(() {
        _initialCenter = LatLng(position.latitude, position.longitude);
      });
    } catch (e) {
      print('Erro ao pegar localização inicial: $e');
    }
  }

  Future<void> _fetchReports() async {
    try {
      final response = await http.get(Uri.parse(_apiUrl));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> reports = data['data'] ?? [];

        final newMarkers = reports.map((r) {
          final lat = (r['lat'] as num?)?.toDouble();
          final lng = (r['lng'] as num?)?.toDouble();
          final category = r['category'] ?? 'Desconhecido';

          if (lat == null || lng == null) return null;


          Color pinColor = Colors.blue;
          if (category.toString().toLowerCase().contains('alagamento')) pinColor = Colors.blue[800]!;
          if (category.toString().toLowerCase().contains('foco de inc')) pinColor = Colors.red;
          if (category.toString().toLowerCase().contains('calor')) pinColor = Colors.deepOrange;
          if (category.toString().toLowerCase().contains('polui')) pinColor = Colors.purple;
          if (category.toString().toLowerCase().contains('perigo')) pinColor = Colors.orange;

          return Marker(
            point: LatLng(lat, lng),
            width: 40,
            height: 40,
            child: GestureDetector(
              onTap: () {
                _showReportDetails(r);
              },
              child: Icon(
                Icons.location_on,
                color: pinColor,
                size: 40,
              ),
            ),
          );
        }).whereType<Marker>().toList();

        setState(() {
          _reports = reports;
          _markers = newMarkers;
          _isLoading = false;
        });
      }
    } catch (e) {
      print('[MapScreen] Erro ao buscar pontos: $e');
      setState(() {
        _isLoading = false;
      });
    }
  }


  List<_DensityCell> _aggregate(bool Function(String category) filter) {
    final Map<String, List<dynamic>> buckets = {};

    for (final r in _reports) {
      final lat = (r['lat'] as num?)?.toDouble();
      final lng = (r['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) continue;
      final category = (r['category'] ?? '').toString().toLowerCase();
      if (!filter(category)) continue;

      final key = '${(lat / _cellSizeDeg).floor()}:${(lng / _cellSizeDeg).floor()}';
      buckets.putIfAbsent(key, () => []).add(r);
    }

    return buckets.values.map((items) {
      double sumLat = 0, sumLng = 0;
      int maxSeverity = 1;
      for (final r in items) {
        sumLat += (r['lat'] as num).toDouble();
        sumLng += (r['lng'] as num).toDouble();
        maxSeverity = max(maxSeverity, (r['severity'] as num?)?.toInt() ?? 1);
      }
      return _DensityCell(LatLng(sumLat / items.length, sumLng / items.length), items.length, maxSeverity);
    }).toList();
  }

  List<CircleMarker> _buildHeatCircles(List<_DensityCell> cells, Color color) {
    return cells.map((cell) {
      final intensity = min(1.0, (cell.count * 0.18) + (cell.maxSeverity * 0.06));
      final radiusMeters = 300.0 + min(cell.count, 10) * 90.0 + cell.maxSeverity * 40.0;
      return CircleMarker(
        point: cell.center,
        radius: radiusMeters,
        useRadiusInMeter: true,
        color: color.withValues(alpha: 0.12 + intensity * 0.45),
        borderColor: color.withValues(alpha: 0.35),
        borderStrokeWidth: 1,
      );
    }).toList();
  }

  List<CircleMarker> _aqiLayer() =>
      _buildHeatCircles(_aggregate((c) => c.contains('polui')), Colors.purple);

  List<CircleMarker> _heatIslandLayer() =>
      _buildHeatCircles(_aggregate((c) => c.contains('calor') || c.contains('foco de inc')), Colors.deepOrange);

  List<CircleMarker> _densityLayer() =>
      _buildHeatCircles(_aggregate((_) => true), Colors.teal);


  void _onAlertZoneChanged() {
    if (!mounted) return;
    setState(() {});
    _focusOnAlertZone();
  }

  void _focusOnAlertZone() {
    final zone = _alertZoneService.zone.value;
    if (zone == null || !_mapReady) return;
    _mapController.move(zone.center, 13.0);
  }

  List<CircleMarker> _exclusionZoneLayer() {
    final zone = _alertZoneService.zone.value;
    if (zone == null) return [];
    return [
      CircleMarker(
        point: zone.center,
        radius: zone.radiusKm * 1000,
        useRadiusInMeter: true,
        color: Colors.red.withValues(alpha: 0.18),
        borderColor: Colors.red,
        borderStrokeWidth: 3,
      ),
      CircleMarker(
        point: zone.center,
        radius: 150,
        useRadiusInMeter: true,
        color: Colors.red.withValues(alpha: 0.6),
        borderColor: Colors.red[900]!,
        borderStrokeWidth: 2,
      ),
    ];
  }

  Widget _buildExclusionBanner(AlertZone zone) {
    return Positioned(
      top: 12,
      left: 12,
      right: 12,
      child: Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(10),
        color: Colors.red[50],
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.alt_route, color: Colors.red),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Rota alternativa: evite um raio de ${zone.radiusKm.toStringAsFixed(1)} km ao redor do ponto de ${zone.category} (severidade ${zone.severity}).',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                tooltip: 'Dispensar',
                onPressed: () => _alertZoneService.clear(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLegend() {
    Widget item(Color color, String label) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 14, height: 14, decoration: BoxDecoration(color: color.withValues(alpha: 0.5), shape: BoxShape.circle, border: Border.all(color: color))),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );

    return Positioned(
      bottom: 12,
      left: 12,
      child: Material(
        elevation: 3,
        borderRadius: BorderRadius.circular(8),
        color: Colors.white.withValues(alpha: 0.92),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Camadas', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              if (_enabledLayers.contains(MapLayerKind.aqi)) item(Colors.purple, 'Qualidade do ar (AQI)'),
              if (_enabledLayers.contains(MapLayerKind.heatIsland)) item(Colors.deepOrange, 'Ilhas de calor'),
              if (_enabledLayers.contains(MapLayerKind.density)) item(Colors.teal, 'Densidade de relatos'),
              if (_enabledLayers.contains(MapLayerKind.exclusionZone)) item(Colors.red, 'Raio de exclusão'),
            ],
          ),
        ),
      ),
    );
  }

  void _showReportDetails(dynamic report) {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(16),
          width: double.infinity,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                report['category'] ?? 'Sem Categoria',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text('Severidade: ${report['severity'] ?? 'N/A'}'),
              const SizedBox(height: 8),
              Text('Data: ${report['timestamp'] ?? 'N/A'}'),
              if (report['geohash'] != null) ...[
                const SizedBox(height: 8),
                Text('GeoHash: ${report['geohash']}  •  Partição: ${report['partition'] ?? 'N/A'}',
                    style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ],
          ),
        );
      }
    );
  }

  @override
  Widget build(BuildContext context) {
    final zone = _alertZoneService.zone.value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Radar Ambiental'),
        backgroundColor: Colors.green[700],
        actions: [
          PopupMenuButton<MapLayerKind>(
            icon: const Icon(Icons.layers),
            tooltip: 'Camadas',
            onSelected: (layer) {
              setState(() {
                if (_enabledLayers.contains(layer)) {
                  _enabledLayers.remove(layer);
                } else {
                  _enabledLayers.add(layer);
                }
              });
            },
            itemBuilder: (context) => [
              CheckedPopupMenuItem(value: MapLayerKind.markers, checked: _enabledLayers.contains(MapLayerKind.markers), child: const Text('Marcadores de relatos')),
              CheckedPopupMenuItem(value: MapLayerKind.aqi, checked: _enabledLayers.contains(MapLayerKind.aqi), child: const Text('Qualidade do ar (AQI)')),
              CheckedPopupMenuItem(value: MapLayerKind.heatIsland, checked: _enabledLayers.contains(MapLayerKind.heatIsland), child: const Text('Ilhas de calor')),
              CheckedPopupMenuItem(value: MapLayerKind.density, checked: _enabledLayers.contains(MapLayerKind.density), child: const Text('Densidade geral')),
              CheckedPopupMenuItem(value: MapLayerKind.exclusionZone, checked: _enabledLayers.contains(MapLayerKind.exclusionZone), child: const Text('Raio de exclusão')),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() => _isLoading = true);
              _fetchReports();
            },
          )
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: zone?.center ?? _initialCenter,
                    initialZoom: 13.0,
                    onMapReady: () {
                      _mapReady = true;
                      _focusOnAlertZone();
                    },
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.ecopulse.ecopulse_mobile',
                    ),
                    if (_enabledLayers.contains(MapLayerKind.density))
                      CircleLayer(circles: _densityLayer()),
                    if (_enabledLayers.contains(MapLayerKind.aqi))
                      CircleLayer(circles: _aqiLayer()),
                    if (_enabledLayers.contains(MapLayerKind.heatIsland))
                      CircleLayer(circles: _heatIslandLayer()),
                    if (_enabledLayers.contains(MapLayerKind.exclusionZone))
                      CircleLayer(circles: _exclusionZoneLayer()),
                    if (_enabledLayers.contains(MapLayerKind.markers))
                      MarkerLayer(
                        markers: _markers,
                      ),
                    if (zone != null && _enabledLayers.contains(MapLayerKind.exclusionZone))
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: zone.center,
                            width: 44,
                            height: 44,
                            child: const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 44),
                          ),
                        ],
                      ),
                  ],
                ),
                if (zone != null && _enabledLayers.contains(MapLayerKind.exclusionZone))
                  _buildExclusionBanner(zone),
                _buildLegend(),
              ],
            ),
    );
  }
}
