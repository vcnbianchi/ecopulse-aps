import 'package:sqflite/sqflite.dart';
import '../models/report_model.dart';
import '../database/database_helper.dart';

class ReportDao {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  
  Future<int> insertReport(ReportModel report) async {
    final db = await _dbHelper.database;
    return await db.insert(
      DatabaseHelper.tableReports,
      report.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  
  Future<List<ReportModel>> getAllReports() async {
    final db = await _dbHelper.database;
    final List<Map<String, dynamic>> maps = await db.query(
      DatabaseHelper.tableReports,
      orderBy: 'created_at DESC',
    );
    
    return List.generate(maps.length, (i) {
      return ReportModel.fromMap(maps[i]);
    });
  }

  
  Future<List<ReportModel>> getPendingReports() async {
    final db = await _dbHelper.database;
    final List<Map<String, dynamic>> maps = await db.query(
      DatabaseHelper.tableReports,
      where: 'sync_status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
    );
    
    return List.generate(maps.length, (i) {
      return ReportModel.fromMap(maps[i]);
    });
  }

  
  Future<int> updateReport(ReportModel report) async {
    final db = await _dbHelper.database;
    return await db.update(
      DatabaseHelper.tableReports,
      report.toMap(),
      where: 'id = ?',
      whereArgs: [report.id],
    );
  }

  
  Future<int> markAsSynced(int id) async {
    final db = await _dbHelper.database;
    return await db.update(
      DatabaseHelper.tableReports,
      {'sync_status': 'synced'},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  
  Future<int> deleteReport(int id) async {
    final db = await _dbHelper.database;
    return await db.delete(
      DatabaseHelper.tableReports,
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
