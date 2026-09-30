class ReportModel {
  final int? id;
  final String category;
  final int severity;
  final String? description;
  final double latitude;
  final double longitude;
  final String status;
  final DateTime createdAt;
  final String syncStatus;

  ReportModel({
    this.id,
    required this.category,
    required this.severity,
    this.description,
    required this.latitude,
    required this.longitude,
    this.status = 'active',
    DateTime? createdAt,
    this.syncStatus = 'pending',
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'category': category,
      'severity': severity,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'sync_status': syncStatus,
    };
  }

  factory ReportModel.fromMap(Map<String, dynamic> map) {
    return ReportModel(
      id: map['id'] as int?,
      category: map['category'] as String,
      severity: map['severity'] as int,
      description: map['description'] as String?,
      latitude: map['latitude'] as double,
      longitude: map['longitude'] as double,
      status: map['status'] as String,
      createdAt: DateTime.parse(map['created_at'] as String),
      syncStatus: map['sync_status'] as String,
    );
  }

  ReportModel copyWith({
    int? id,
    String? category,
    int? severity,
    String? description,
    double? latitude,
    double? longitude,
    String? status,
    DateTime? createdAt,
    String? syncStatus,
  }) {
    return ReportModel(
      id: id ?? this.id,
      category: category ?? this.category,
      severity: severity ?? this.severity,
      description: description ?? this.description,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      syncStatus: syncStatus ?? this.syncStatus,
    );
  }
}
