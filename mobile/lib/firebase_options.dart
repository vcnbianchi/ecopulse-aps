// PLACEHOLDER gerado manualmente.
//
// Substitua este arquivo pelo gerado automaticamente pela FlutterFire CLI:
//
//   dart pub global activate flutterfire_cli
//   flutterfire configure --project=<seu-projeto-firebase> --platforms=android
//
// O comando preenche as chaves reais do projeto (apiKey, appId, messagingSenderId,
// projectId) para o package `com.ecopulse.ecopulse_mobile`. Com a inicialização
// "Dart-only" (Firebase.initializeApp(options: ...)) não é necessário aplicar o
// plugin Gradle google-services nem o arquivo google-services.json.
//
// Enquanto os valores abaixo forem placeholders, o app continua funcionando
// normalmente (mapa, relatos offline-first, alertas via WebSocket); apenas o
// canal de push notifications fica desabilitado.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('DefaultFirebaseOptions não configurado para web.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError('DefaultFirebaseOptions não suportado para esta plataforma.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'REPLACE_WITH_FIREBASE_ANDROID_API_KEY',
    appId: '1:000000000000:android:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'ecopulse-replace-me',
    storageBucket: 'ecopulse-replace-me.appspot.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'REPLACE_WITH_FIREBASE_IOS_API_KEY',
    appId: '1:000000000000:ios:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'ecopulse-replace-me',
    storageBucket: 'ecopulse-replace-me.appspot.com',
    iosBundleId: 'com.ecopulse.ecopulseMobile',
  );
}
