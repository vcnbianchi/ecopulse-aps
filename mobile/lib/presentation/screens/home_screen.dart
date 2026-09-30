import 'package:flutter/material.dart';
import 'map_screen.dart';
import 'report_form_screen.dart';
import '../../data/services/websocket_service.dart';
import '../../data/services/alert_zone_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  final AlertZoneService _alertZoneService = AlertZoneService();

  @override
  void initState() {
    super.initState();

    WebSocketService().initialize(context);

    // "Ver rota alternativa" (modal) ou toque na push notification: volta para o mapa
    _alertZoneService.navigationRequests.addListener(_goToMap);
  }

  @override
  void dispose() {
    _alertZoneService.navigationRequests.removeListener(_goToMap);
    super.dispose();
  }

  void _goToMap() {
    if (!mounted) return;
    setState(() {
      _currentIndex = 0;
    });
  }

  final List<Widget> _pages = [
    const MapScreen(),
    const ReportFormScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        selectedItemColor: Colors.green[700],
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.map),
            label: 'Radar',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.add_alert),
            label: 'Reportar',
          ),
        ],
      ),
    );
  }
}
