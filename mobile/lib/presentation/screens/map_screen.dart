import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final String _apiUrl = 'http://10.0.2.2:4500/api/reports';
  List<Marker> _markers = [];
  bool _isLoading = true;
  LatLng _initialCenter = const LatLng(-23.5505, -46.6333); 

  @override
  void initState() {
    super.initState();
    _initializeApp();
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
          final lat = r['lat'] as double?;
          final lng = r['lng'] as double?;
          final category = r['category'] ?? 'Desconhecido';
          
          if (lat == null || lng == null) return null;

          
          Color pinColor = Colors.blue;
          if (category.toString().toLowerCase().contains('alagamento')) pinColor = Colors.blue[800]!;
          if (category.toString().toLowerCase().contains('foco de incendio')) pinColor = Colors.red;
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
            ],
          ),
        );
      }
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Radar Ambiental'),
        backgroundColor: Colors.green[700],
        actions: [
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
          : FlutterMap(
              options: MapOptions(
                initialCenter: _initialCenter,
                initialZoom: 13.0,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.example.ecopulse_mobile',
                ),
                MarkerLayer(
                  markers: _markers,
                ),
              ],
            ),
    );
  }
}
