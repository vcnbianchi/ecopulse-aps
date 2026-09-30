import 'package:flutter/material.dart';
import 'core/app_config.dart';
import 'presentation/screens/home_screen.dart';
import 'data/services/sync_service.dart';
import 'data/services/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase + handler de push em segundo plano (precisa ser antes do runApp)
  final pushService = PushNotificationService();
  await pushService.initializeFirebase();

  final syncService = SyncService();
  syncService.initializeNetworkListener();

  syncService.syncPendingReports();

  runApp(const MyApp());

  // Permissão de notificação, token FCM e registro do dispositivo no backend
  pushService.initialize();
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EcoPulse',
      navigatorKey: navigatorKey,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
