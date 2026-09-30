import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';

class DatabaseHelper {
  static const _databaseName = "EcoPulseLocal.db";
  static const _databaseVersion = 1;

  static const tableReports = 'reports';

  
  DatabaseHelper._privateConstructor();
  static final DatabaseHelper instance = DatabaseHelper._privateConstructor();

  static Database? _database;
  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final documentsDirectory = await getApplicationDocumentsDirectory();
    final path = join(documentsDirectory.path, _databaseName);
    
    return await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
    );
  }

  Future _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE $tableReports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        severity INTEGER NOT NULL,
        description TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending'
      )
    ''');
    
    
    await db.execute(
      'CREATE INDEX idx_sync_status ON $tableReports (sync_status)'
    );
  }

  Future<void> close() async {
    final db = await instance.database;
    db.close();
    _database = null;
  }
}
