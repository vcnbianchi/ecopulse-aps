import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../data/models/report_model.dart';
import '../../data/dao/report_dao.dart';
import '../../data/services/sync_service.dart';

class ReportFormScreen extends StatefulWidget {
  const ReportFormScreen({super.key});

  @override
  State<ReportFormScreen> createState() => _ReportFormScreenState();
}

class _ReportFormScreenState extends State<ReportFormScreen> {
  final _formKey = GlobalKey<FormState>();


  String _category = 'Alagamento';
  double _severity = 1;
  String _description = '';


  Position? _currentPosition;
  bool _isLoadingLocation = false;
  bool _isSubmitting = false;

  final ReportDao _reportDao = ReportDao();

  final List<String> _categories = [
    'Alagamento',
    'Poluição',
    'Ilha de Calor',
    'Foco de Incêndio',
    'Zona de Perigo',
    'Deslizamento',
    'Outros'
  ];

  Future<void> _getCurrentLocation() async {
    setState(() {
      _isLoadingLocation = true;
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Os serviços de localização estão desativados.');
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          throw Exception('Permissão de localização negada.');
        }
      }

      if (permission == LocationPermission.deniedForever) {
        throw Exception('Permissões de localização permanentemente negadas.');
      }

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)
      );

      setState(() {
        _currentPosition = position;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      setState(() {
        _isLoadingLocation = false;
      });
    }
  }

  Future<void> _submitReport() async {
    if (!_formKey.currentState!.validate()) return;

    if (_currentPosition == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Por favor, obtenha sua localização atual primeiro.')),
      );
      return;
    }

    _formKey.currentState!.save();

    setState(() {
      _isSubmitting = true;
    });

    try {
      final report = ReportModel(
        category: _category,
        severity: _severity.toInt(),
        description: _description,
        latitude: _currentPosition!.latitude,
        longitude: _currentPosition!.longitude,
      );


      await _reportDao.insertReport(report);


      SyncService().syncPendingReports();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Relato salvo localmente com sucesso!')),
        );

        _formKey.currentState!.reset();
        setState(() {
          _currentPosition = null;
          _severity = 1;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao salvar relato.')),
        );
      }
    } finally {
      setState(() {
        _isSubmitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Novo Relato Ambiental'),
        backgroundColor: Colors.green[700],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const Text('Categoria da Ocorrência', style: TextStyle(fontWeight: FontWeight.bold)),
              DropdownButtonFormField<String>(
                initialValue: _category,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                items: _categories.map((cat) {
                  return DropdownMenuItem(value: cat, child: Text(cat));
                }).toList(),
                onChanged: (value) {
                  setState(() {
                    _category = value!;
                  });
                },
              ),
              const SizedBox(height: 16),

              Text('Severidade: ${_severity.toInt()}', style: const TextStyle(fontWeight: FontWeight.bold)),
              Slider(
                value: _severity,
                min: 1,
                max: 5,
                divisions: 4,
                activeColor: Colors.orange,
                label: _severity.round().toString(),
                onChanged: (value) {
                  setState(() {
                    _severity = value;
                  });
                },
              ),
              const SizedBox(height: 16),

              const Text('Descrição', style: TextStyle(fontWeight: FontWeight.bold)),
              TextFormField(
                decoration: const InputDecoration(
                  hintText: 'Detalhe a ocorrência...',
                  border: OutlineInputBorder()
                ),
                maxLines: 3,
                onSaved: (value) {
                  _description = value ?? '';
                },
              ),
              const SizedBox(height: 24),

              const Text('Localização', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  borderRadius: BorderRadius.circular(8)
                ),
                child: Row(
                  children: [
                    const Icon(Icons.location_on, color: Colors.red),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _currentPosition != null
                          ? 'Lat: ${_currentPosition!.latitude.toStringAsFixed(4)}, Lng: ${_currentPosition!.longitude.toStringAsFixed(4)}'
                          : 'Localização não capturada',
                      ),
                    ),
                    ElevatedButton(
                      onPressed: _isLoadingLocation ? null : _getCurrentLocation,
                      child: _isLoadingLocation
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Obter GPS'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              SizedBox(
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green[700],
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _isSubmitting ? null : _submitReport,
                  child: _isSubmitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('SALVAR RELATO (Offline)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }
}
