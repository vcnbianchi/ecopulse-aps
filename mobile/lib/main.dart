import 'package:flutter/material.dart';
import 'presentation/screens/home_screen.dart';
import 'data/services/sync_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  
  final syncService = SyncService();
  syncService.initializeNetworkListener();
  
  syncService.syncPendingReports();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EcoPulse',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
