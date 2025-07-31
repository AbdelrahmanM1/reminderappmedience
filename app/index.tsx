import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Modal,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotification, { Importance } from 'react-native-push-notification';
import DateTimePicker from '@react-native-community/datetimepicker';

// Medicine interface
interface Medicine {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  frequency: 'daily' | 'weekly';
  startDate: string;
  isActive: boolean;
  lastTaken?: string;
}

interface ValidationErrors {
  name?: string;
  dosage?: string;
  time?: string;
}

const MedicineReminderApp: React.FC = () => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    dosage: '',
    time: '',
    frequency: 'daily' as 'daily' | 'weekly',
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isNotificationConfigured, setIsNotificationConfigured] = useState(false);
  
  const initializationRef = useRef({
    isInitialized: false,
    isConfigured: false,
    initializationAttempted: false,
  });

  // Check if PushNotification module is available
  const isPushNotificationAvailable = useCallback(() => {
    try {
      return (
        PushNotification && 
        typeof PushNotification === 'object' &&
        typeof PushNotification.configure === 'function'
      );
    } catch (error) {
      console.warn('PushNotification check failed:', error);
      return false;
    }
  }, []);

  // Request notification permissions for Android 13+
  const requestNotificationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'إذن التنبيهات',
              message: 'يحتاج التطبيق إلى إذن إرسال التنبيهات لتذكيرك بالأدوية',
              buttonNeutral: 'اسأل لاحقاً',
              buttonNegative: 'إلغاء',
              buttonPositive: 'موافق',
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
      } catch (err) {
        console.warn('Permission error:', err);
        return false;
      }
    }
    return true;
  };

  // Create notification channel
  const createNotificationChannel = useCallback(() => {
    if (!isPushNotificationAvailable()) {
      console.warn('Notifications not available');
      return;
    }

    try {
      if (Platform.OS === 'android' && PushNotification?.createChannel) {
        PushNotification.createChannel(
          {
            channelId: 'medicine-reminders',
            channelName: 'Medicine Reminders',
            channelDescription: 'تذكيرات الأدوية',
            soundName: 'default',
            importance: Importance.HIGH,
            vibrate: true,
          },
          (created) => {
            console.log(`Channel created: ${created}`);
            initializationRef.current.isConfigured = true;
            setIsNotificationConfigured(true);
          }
        );
      } else {
        initializationRef.current.isConfigured = true;
        setIsNotificationConfigured(true);
      }
    } catch (error) {
      console.error('Channel creation error:', error);
      initializationRef.current.isConfigured = true;
      setIsNotificationConfigured(true);
    }
  }, [isPushNotificationAvailable]);

  // Initialize notifications
  useEffect(() => {
    const initializeNotifications = async () => {
      if (initializationRef.current.initializationAttempted) {
        return;
      }
      
      initializationRef.current.initializationAttempted = true;

      try {
        if (!isPushNotificationAvailable()) {
          console.warn('PushNotification not available');
          setNotificationsEnabled(false);
          setIsNotificationConfigured(false);
          return;
        }

        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
          console.warn('Permission denied');
          setNotificationsEnabled(false);
          return;
        }

        if (PushNotification.configure) {
          PushNotification.configure({
            onRegister: (token) => {
              console.log('TOKEN:', token);
              setNotificationsEnabled(true);
              initializationRef.current.isInitialized = true;
              createNotificationChannel();
            },
            onNotification: (notification) => {
              console.log('NOTIFICATION:', notification);
            },
            onRegistrationError: (err) => {
              console.error('Registration error:', err);
              setNotificationsEnabled(false);
              setIsNotificationConfigured(false);
            },
            permissions: {
              alert: true,
              badge: true,
              sound: true,
            },
            popInitialNotification: false,
            requestPermissions: Platform.OS === 'ios',
          });
        }

        setTimeout(() => {
          if (!initializationRef.current.isConfigured) {
            console.log('Using fallback notification setup');
            setNotificationsEnabled(true);
            setIsNotificationConfigured(true);
          }
        }, 5000);

      } catch (error) {
        console.error('Initialization error:', error);
        setNotificationsEnabled(false);
        setIsNotificationConfigured(false);
      }
    };

    initializeNotifications();
  }, [createNotificationChannel, isPushNotificationAvailable]);

  // Load medicines from storage
  const loadMedicines = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('medicine_reminders');
      if (stored) {
        setMedicines(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Load error:', error);
    }
  }, []);

  // Save medicines to storage
  const saveMedicines = useCallback(async (medicineList: Medicine[]) => {
    try {
      await AsyncStorage.setItem('medicine_reminders', JSON.stringify(medicineList));
    } catch (error) {
      console.error('Save error:', error);
    }
  }, []);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  useEffect(() => {
    if (medicines.length >= 0) {
      saveMedicines(medicines);
    }
  }, [medicines, saveMedicines]);

  // Schedule notifications for a medicine
  const scheduleNotification = useCallback((medicine: Medicine) => {
    if (!notificationsEnabled || !isNotificationConfigured) {
      console.warn('Notifications not ready');
      return;
    }

    try {
      medicine.times.forEach((time, index) => {
        const [hours, minutes] = time.split(':').map(Number);
        const notificationDate = new Date();
        notificationDate.setHours(hours, minutes, 0, 0);

        if (notificationDate <= new Date()) {
          notificationDate.setDate(notificationDate.getDate() + 1);
        }

        const notificationId = `${medicine.id}_${index}`;
        
        const notificationConfig: any = {
          id: notificationId,
          title: '🔔 حان وقت الدواء',
          message: `تذكير: تناول ${medicine.name} - ${medicine.dosage}`,
          date: notificationDate,
          repeatType: medicine.frequency === 'daily' ? 'day' : 'week',
          allowWhileIdle: true,
          soundName: 'default',
          vibrate: true,
        };

        if (Platform.OS === 'android') {
          notificationConfig.channelId = 'medicine-reminders';
        }

        if (PushNotification.localNotificationSchedule) {
          PushNotification.localNotificationSchedule(notificationConfig);
        }
      });
    } catch (error) {
      console.error('Scheduling error:', error);
      Alert.alert('خطأ', 'حدث خطأ في جدولة التذكيرات');
    }
  }, [notificationsEnabled, isNotificationConfigured]);

  // Cancel notifications for a medicine
  const cancelNotifications = useCallback((medicineId: string) => {
    if (!notificationsEnabled || !isNotificationConfigured) return;

    try {
      if (PushNotification.cancelLocalNotification) {
        for (let i = 0; i < 10; i++) {
          PushNotification.cancelLocalNotification(`${medicineId}_${i}`);
        }
      }
    } catch (error) {
      console.error('Cancellation error:', error);
    }
  }, [notificationsEnabled, isNotificationConfigured]);

  // Test notification function
  const testNotification = useCallback(() => {
    if (!notificationsEnabled || !isNotificationConfigured) {
      Alert.alert('خطأ', 'التنبيهات غير مفعلة');
      return;
    }

    try {
      const notificationConfig: any = {
        title: '🧪 تجربة التنبيه',
        message: 'هذا تنبيه تجريبي',
        playSound: true,
        soundName: 'default',
      };

      if (Platform.OS === 'android') {
        notificationConfig.channelId = 'medicine-reminders';
      }

      if (PushNotification.localNotification) {
        PushNotification.localNotification(notificationConfig);
        Alert.alert('نجح', 'تم إرسال التنبيه');
      }
    } catch (error) {
      console.error('Test notification error:', error);
      Alert.alert('خطأ', 'فشل إرسال التنبيه');
    }
  }, [notificationsEnabled, isNotificationConfigured]);

  // Retry notification setup
  const retryNotificationSetup = useCallback(() => {
    initializationRef.current = {
      isInitialized: false,
      isConfigured: false,
      initializationAttempted: false,
    };
    setNotificationsEnabled(false);
    setIsNotificationConfigured(false);
    
    setTimeout(() => {
      const initializeNotifications = async () => {
        try {
          if (!isPushNotificationAvailable()) {
            console.warn('PushNotification not available');
            return;
          }

          const hasPermission = await requestNotificationPermission();
          if (!hasPermission) {
            console.warn('Permission denied');
            return;
          }

          if (PushNotification.configure) {
            PushNotification.configure({
              onRegister: (token) => {
                console.log('TOKEN:', token);
                setNotificationsEnabled(true);
                initializationRef.current.isInitialized = true;
                createNotificationChannel();
              },
              onNotification: (notification) => {
                console.log('NOTIFICATION:', notification);
              },
              permissions: {
                alert: true,
                badge: true,
                sound: true,
              },
              popInitialNotification: false,
              requestPermissions: Platform.OS === 'ios',
            });
          }
        } catch (error) {
          console.error('Retry error:', error);
        }
      };
      initializeNotifications();
    }, 1000);
  }, [createNotificationChannel, isPushNotificationAvailable]);

  // Validation functions
  const validateMedicineName = (name: string) => name.trim().length >= 2;
  const validateDosage = (dosage: string) => dosage.trim().length >= 2;
  const validateTime = (time: string) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);

  const validateForm = () => {
    const errors: ValidationErrors = {};
    if (!validateMedicineName(newMedicine.name)) {
      errors.name = 'اسم الدواء يجب أن يكون على الأقل حرفين';
    }
    if (!validateDosage(newMedicine.dosage)) {
      errors.dosage = 'الجرعة يجب أن تكون على الأقل حرفين';
    }
    if (!validateTime(newMedicine.time)) {
      errors.time = 'يرجى إدخال وقت صحيح';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Add new medicine
  const addMedicine = () => {
    if (!validateForm()) {
      Alert.alert('خطأ', 'يرجى تصحيح الأخطاء');
      return;
    }

    if (medicines.some(med => med.name.toLowerCase() === newMedicine.name.toLowerCase())) {
      Alert.alert('خطأ', 'يوجد دواء بهذا الاسم');
      return;
    }

    const medicine: Medicine = {
      id: Date.now().toString(),
      name: newMedicine.name.trim(),
      dosage: newMedicine.dosage.trim(),
      times: [newMedicine.time],
      frequency: newMedicine.frequency,
      startDate: new Date().toISOString(),
      isActive: true,
    };

    setMedicines([...medicines, medicine]);
    
    if (isNotificationConfigured && notificationsEnabled) {
      scheduleNotification(medicine);
    }
    
    setNewMedicine({ name: '', dosage: '', time: '', frequency: 'daily' });
    setValidationErrors({});
    setShowAddForm(false);
    
    Alert.alert('نجح', 'تم إضافة الدواء بنجاح');
  };

  // Mark medicine as taken
  const markAsTaken = (id: string) => {
    setMedicines(medicines.map(med => 
      med.id === id ? { ...med, lastTaken: new Date().toISOString() } : med
    ));
    Alert.alert('تم', 'تم تسجيل تناول الدواء');
  };

  // Toggle medicine active status
  const toggleMedicine = (id: string) => {
    const medicine = medicines.find(med => med.id === id);
    if (!medicine) return;

    const updated = medicines.map(med => 
      med.id === id ? { ...med, isActive: !med.isActive } : med
    );
    
    setMedicines(updated);

    if (medicine.isActive) {
      cancelNotifications(id);
    } else if (isNotificationConfigured && notificationsEnabled) {
      scheduleNotification({ ...medicine, isActive: true });
    }
  };

  // Delete medicine
  const deleteMedicine = (id: string) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف هذا الدواء؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            cancelNotifications(id);
            setMedicines(medicines.filter(med => med.id !== id));
          },
        },
      ]
    );
  };

  // Format time display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour12 = parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
    const ampm = parseInt(hours) >= 12 ? 'مساءً' : 'صباحاً';
    return `${hour12 === 0 ? 12 : hour12}:${minutes} ${ampm}`;
  };

  // Get time until next dose
  const getTimeUntilNext = (times: string[]) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const nextTimes = times.map(time => {
      const [hours, minutes] = time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;
      return timeInMinutes > currentTime ? timeInMinutes : timeInMinutes + 24 * 60;
    });
    
    const nextTime = Math.min(...nextTimes);
    const hoursLeft = Math.floor((nextTime - currentTime) / 60);
    const minutesLeft = (nextTime - currentTime) % 60;
    
    if (hoursLeft <= 0) {
      return `خلال ${minutesLeft} دقيقة`;
    }
    return `خلال ${hoursLeft} ساعة و ${minutesLeft} دقيقة`;
  };

  // Handle time picker
  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setSelectedTime(selectedTime);
      const timeString = `${selectedTime.getHours().toString().padStart(2, '0')}:${selectedTime.getMinutes().toString().padStart(2, '0')}`;
      setNewMedicine({...newMedicine, time: timeString});
      if (validationErrors.time) {
        setValidationErrors({...validationErrors, time: undefined});
      }
    }
  };

  // Handle input changes
  const handleNameChange = (text: string) => {
    setNewMedicine({...newMedicine, name: text});
    if (validationErrors.name) {
      setValidationErrors({...validationErrors, name: undefined});
    }
  };

  const handleDosageChange = (text: string) => {
    setNewMedicine({...newMedicine, dosage: text});
    if (validationErrors.dosage) {
      setValidationErrors({...validationErrors, dosage: undefined});
    }
  };

  // Get notification status text
  const getNotificationStatus = () => {
    if (!isPushNotificationAvailable()) {
      return '❌ وحدة التذكيرات غير مثبتة';
    }
    if (!notificationsEnabled) {
      return '❌ التذكيرات غير مفعلة';
    }
    if (!isNotificationConfigured) {
      return '⏳ جاري إعداد التذكيرات';
    }
    return '✅ التذكيرات تعمل';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#3B82F6" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💊 تذكير الأدوية</Text>
        <Text style={styles.headerSubtitle}>اعتني بصحتك</Text>
        <Text style={[
          styles.statusText,
          notificationsEnabled && isNotificationConfigured ? styles.statusEnabled : styles.statusDisabled
        ]}>
          {getNotificationStatus()}
        </Text>
        
        {notificationsEnabled && isNotificationConfigured ? (
          <TouchableOpacity onPress={testNotification} style={styles.testButton}>
            <Text style={styles.testButtonText}>🧪 تجربة التنبيه</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={retryNotificationSetup} style={styles.retryButton}>
            <Text style={styles.testButtonText}>🔄 إعادة المحاولة</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          style={[styles.addButton, showAddForm && styles.cancelButton]}
        >
          <Text style={styles.addButtonText}>
            {showAddForm ? '❌ إلغاء' : '➕ إضافة دواء جديد'}
          </Text>
        </TouchableOpacity>

        <Modal visible={showAddForm} animationType="slide">
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إضافة دواء جديد</Text>
              <TouchableOpacity
                onPress={() => setShowAddForm(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>❌</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>اسم الدواء</Text>
                <TextInput
                  style={[styles.textInput, validationErrors.name && styles.errorInput]}
                  placeholder="اسم الدواء"
                  value={newMedicine.name}
                  onChangeText={handleNameChange}
                  textAlign="right"
                />
                {validationErrors.name && (
                  <Text style={styles.errorText}>{validationErrors.name}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>الجرعة</Text>
                <TextInput
                  style={[styles.textInput, validationErrors.dosage && styles.errorInput]}
                  placeholder="مثال: حبة واحدة"
                  value={newMedicine.dosage}
                  onChangeText={handleDosageChange}
                  textAlign="right"
                />
                {validationErrors.dosage && (
                  <Text style={styles.errorText}>{validationErrors.dosage}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>الوقت</Text>
                <TouchableOpacity
                  style={[styles.timeButton, validationErrors.time && styles.errorInput]}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={[styles.timeButtonText, !newMedicine.time && styles.placeholderText]}>
                    {newMedicine.time ? formatTime(newMedicine.time) : 'اختر الوقت'}
                  </Text>
                </TouchableOpacity>
                {validationErrors.time && (
                  <Text style={styles.errorText}>{validationErrors.time}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>التكرار</Text>
                <View style={styles.frequencyContainer}>
                  <TouchableOpacity
                    style={[
                      styles.frequencyButton,
                      newMedicine.frequency === 'daily' && styles.frequencyButtonActive
                    ]}
                    onPress={() => setNewMedicine({...newMedicine, frequency: 'daily'})}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      newMedicine.frequency === 'daily' && styles.frequencyButtonTextActive
                    ]}>
                      يومياً
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.frequencyButton,
                      newMedicine.frequency === 'weekly' && styles.frequencyButtonActive
                    ]}
                    onPress={() => setNewMedicine({...newMedicine, frequency: 'weekly'})}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      newMedicine.frequency === 'weekly' && styles.frequencyButtonTextActive
                    ]}>
                      أسبوعياً
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={addMedicine}
                style={styles.submitButton}
              >
                <Text style={styles.submitButtonText}>✅ إضافة الدواء</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {showTimePicker && (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={onTimeChange}
          />
        )}

        <View style={styles.medicinesList}>
          {medicines.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📋</Text>
              <Text style={styles.emptyStateTitle}>لا توجد أدوية مضافة</Text>
              <Text style={styles.emptyStateText}>
                اضغط على إضافة دواء جديد لبدء إضافة أدويتك
              </Text>
            </View>
          ) : (
            medicines.map((medicine) => (
              <View
                key={medicine.id}
                style={[styles.medicineCard, !medicine.isActive && styles.inactiveMedicineCard]}
              >
                <View style={styles.medicineHeader}>
                  <View style={styles.medicineInfo}>
                    <Text style={styles.medicineName}>💊 {medicine.name}</Text>
                    <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                  </View>
                  
                  <View style={styles.medicineActions}>
                    <TouchableOpacity
                      onPress={() => toggleMedicine(medicine.id)}
                      style={[styles.actionButton, medicine.isActive ? styles.activeButton : styles.inactiveButton]}
                    >
                      <Text style={styles.actionButtonText}>
                        {medicine.isActive ? '🔔' : '🔕'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => deleteMedicine(medicine.id)}
                      style={[styles.actionButton, styles.deleteButton]}
                    >
                      <Text style={styles.actionButtonText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.medicineDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>🕐 الوقت:</Text>
                    <Text style={styles.detailValue}>
                      {medicine.times.map(formatTime).join(', ')}
                    </Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>📅 التكرار:</Text>
                    <Text style={styles.detailValue}>
                      {medicine.frequency === 'daily' ? 'يومياً' : 'أسبوعياً'}
                    </Text>
                  </View>

                  {medicine.isActive && (
                    <View style={styles.detailRow}>
                      <Text style={styles.nextDoseLabel}>⏳ الجرعة التالية:</Text>
                      <Text style={styles.nextDoseValue}>
                        {getTimeUntilNext(medicine.times)}
                      </Text>
                    </View>
                  )}

                  {medicine.lastTaken && (
                    <View style={styles.detailRow}>
                      <Text style={styles.lastTakenLabel}>✅ آخر جرعة:</Text>
                      <Text style={styles.lastTakenValue}>
                        {new Date(medicine.lastTaken).toLocaleString('ar')}
                      </Text>
                    </View>
                  )}
                </View>

                {medicine.isActive && (
                  <TouchableOpacity
                    onPress={() => markAsTaken(medicine.id)}
                    style={styles.takenButton}
                  >
                    <Text style={styles.takenButtonText}>✅ تم تناول الدواء</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#BFDBFE',
    marginTop: 4,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  statusEnabled: {
    color: '#10F981',
  },
  statusDisabled: {
    color: '#FED7AA',
  },
  testButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  retryButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  testButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  addButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 16,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  addButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  textInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  errorInput: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'right',
  },
  timeButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'right',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  frequencyContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  frequencyButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  frequencyButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  frequencyButtonText: {
    fontSize: 16,
    color: '#374151',
  },
  frequencyButtonTextActive: {
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  medicinesList: {
    paddingBottom: 32,
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 48,
    alignItems: 'center',
    marginVertical: 16,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  medicineCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  inactiveMedicineCard: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  medicineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'right',
  },
  medicineDosage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'right',
  },
  medicineActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: '#10B981',
  },
  inactiveButton: {
    backgroundColor: '#F59E0B',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    fontSize: 16,
  },
  medicineDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  nextDoseLabel: {
    fontSize: 16,
    color: '#F59E0B',
  },
  nextDoseValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  lastTakenLabel: {
    fontSize: 16,
    color: '#10B981',
  },
  lastTakenValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#10B981',
  },
  takenButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  takenButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MedicineReminderApp;