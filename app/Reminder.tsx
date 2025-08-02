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
  Vibration,
  Animated,
  RefreshControl,
  AppState,
  AppStateStatus,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';

// Medicine interface with new features
interface Medicine {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  frequency: 'daily' | 'weekly';
  weeklyDays?: number[]; // 0 = Sunday, 1 = Monday, etc.
  startDate: string;
  isActive: boolean;
  lastTaken?: string;
  color?: string;
  stock?: number;
  stockAlert?: number;
}

interface ValidationErrors {
  name?: string;
  dosage?: string;
  time?: string;
  stock?: string;
}

interface ActiveAlarm {
  medicineId: string;
  medicineName: string;
  dosage: string;
  time: string;
  snoozeCount: number;
}

// Predefined colors for medicines with modern gradient-inspired colors
const MEDICINE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#FF8A80', '#80CBC4', '#81C784', '#FFB74D', '#CE93D8'
];

const DAYS_OF_WEEK = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const MedicineReminderApp: React.FC = () => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    dosage: '',
    times: [''],
    frequency: 'daily' as 'daily' | 'weekly',
    weeklyDays: [] as number[],
    stock: '',
    stockAlert: '',
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  
  // Sound and timer refs
  const soundRef = useRef<Audio.Sound | null>(null);
  const vibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Animation values
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;
  const alarmScaleAnimation = useRef(new Animated.Value(0)).current;

  // Handle app state changes - using appState for background/foreground functionality
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousAppState = appState;
      setAppState(nextAppState);
      
      // When app comes from background to foreground, check for missed alarms
      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        // Trigger any missed medicine checks when app becomes active
        console.log('App became active, checking for missed medications');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [appState]);

  // Initialize audio settings
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.log('Audio initialization error:', error);
      }
    };

    initializeAudio();
  }, []);

  // Initialize animations
  useEffect(() => {
    Animated.timing(fadeAnimation, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnimation]);

  // Pulse animation for alarm
  useEffect(() => {
    if (showAlarmModal) {
      // Scale in animation
      Animated.spring(alarmScaleAnimation, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Continuous pulse
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        alarmScaleAnimation.setValue(0);
      };
    }
  }, [showAlarmModal, pulseAnimation, alarmScaleAnimation]);

  // Create alarm sound using expo-av
  const createAlarmSound = useCallback(async () => {
    try {
      // Create a simple alarm beep using Audio.Sound
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sound/alarm.mp3'), // You'll need to add an alarm sound file
        { 
          shouldPlay: false, 
          isLooping: true,
          volume: 1.0,
        }
      );
      return sound;
    } catch (error) {
      console.log('Error creating sound, using vibration only:', error);
      return null;
    }
  }, []);

  // Play alarm sound
  const playAlarmSound = useCallback(async () => {
    try {
      const sound = await createAlarmSound();
      if (sound) {
        soundRef.current = sound;
        await sound.playAsync();
        
        // Stop sound after 60 seconds if not manually stopped
        setTimeout(async () => {
          if (soundRef.current) {
            try {
              await soundRef.current.stopAsync();
              await soundRef.current.unloadAsync();
            } catch (e) {
              console.log('Error stopping sound:', e);
            }
            soundRef.current = null;
          }
        }, 60000);
      }
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  }, [createAlarmSound]);

  // Stop alarm sound
  const stopAlarmSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (error) {
      console.log('Error stopping sound:', error);
    }
  }, []);

  // Mark medicine as taken and update stock
  const markAsTaken = useCallback((id: string) => {
    setMedicines(prev => prev.map(med => {
      if (med.id === id) {
        const newStock = med.stock ? Math.max(0, med.stock - 1) : undefined;
        return { 
          ...med, 
          lastTaken: new Date().toISOString(),
          stock: newStock
        };
      }
      return med;
    }));
    Alert.alert('تم', 'تم تسجيل تناول الدواء');
  }, []);

  // Stop alarm (sound and vibration)
  const stopAlarm = useCallback(async () => {
    await stopAlarmSound();
    
    if (vibrationRef.current) {
      clearInterval(vibrationRef.current);
      vibrationRef.current = null;
    }
    Vibration.cancel();

    setActiveAlarm(null);
    setShowAlarmModal(false);
  }, [stopAlarmSound]);

  // Trigger alarm function with sound and vibration
  const triggerAlarm = useCallback(async (alarmData: ActiveAlarm) => {
    if (activeAlarm) return; // Don't trigger if alarm is already active

    setActiveAlarm(alarmData);
    setShowAlarmModal(true);

    // Start sound
    await playAlarmSound();

    // Start strong vibration pattern
    const vibrationPattern = [0, 1000, 500, 1000, 500, 1000];
    Vibration.vibrate(vibrationPattern, true);
    
    // Additional vibration interval for stronger effect
    vibrationRef.current = setInterval(() => {
      Vibration.vibrate([500, 300, 500, 300]);
    }, 4000);

  }, [activeAlarm, playAlarmSound]);

  // Snooze alarm for 5 minutes
  const snoozeAlarm = useCallback(async () => {
    if (activeAlarm) {
      await stopAlarm();
      
      // Set a new alarm 5 minutes from now
      setTimeout(() => {
        const snoozedAlarm = {
          ...activeAlarm,
          snoozeCount: activeAlarm.snoozeCount + 1
        };
        triggerAlarm(snoozedAlarm);
      }, 5 * 60 * 1000); // 5 minutes
      
      Alert.alert('تأجيل', 'تم تأجيل المنبه لمدة 5 دقائق');
    }
  }, [activeAlarm, stopAlarm, triggerAlarm]);

  // Mark medicine as taken and stop alarm
  const markAsTakenFromAlarm = useCallback(async () => {
    if (activeAlarm) {
      markAsTaken(activeAlarm.medicineId);
      await stopAlarm();
    }
  }, [activeAlarm, stopAlarm, markAsTaken]);

  // Cleanup function for timers and sound
  useEffect(() => {
    return () => {
      const cleanup = async () => {
        if (vibrationRef.current) {
          clearInterval(vibrationRef.current);
        }
        if (alarmCheckRef.current) {
          clearInterval(alarmCheckRef.current);
        }
        await stopAlarmSound();
      };
      cleanup();
    };
  }, [stopAlarmSound]);

  // Check if today is a selected weekly day
  const isWeeklyDayActive = (medicine: Medicine): boolean => {
    if (medicine.frequency !== 'weekly' || !medicine.weeklyDays) return true;
    const today = new Date().getDay();
    return medicine.weeklyDays.includes(today);
  };

  // Check for medicine times every minute
  useEffect(() => {
    const checkMedicineTimes = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      medicines.forEach(medicine => {
        if (medicine.isActive && medicine.times.includes(currentTime)) {
          // For weekly medicines, check if today is selected
          if (medicine.frequency === 'weekly' && !isWeeklyDayActive(medicine)) {
            return;
          }

          const lastTaken = medicine.lastTaken ? new Date(medicine.lastTaken) : null;
          const timeSinceLastTaken = lastTaken ? (now.getTime() - lastTaken.getTime()) / (1000 * 60) : Infinity;
          
          // Only trigger if it's been more than 1 minute since last taken
          if (timeSinceLastTaken > 1) {
            // Check stock alert
            if (medicine.stock !== undefined && medicine.stockAlert !== undefined) {
              if (medicine.stock <= medicine.stockAlert) {
                Alert.alert(
                  '⚠️ تنبيه المخزون',
                  `مخزون دواء ${medicine.name} منخفض (${medicine.stock} متبقي)`
                );
              }
            }

            triggerAlarm({
              medicineId: medicine.id,
              medicineName: medicine.name,
              dosage: medicine.dosage,
              time: currentTime,
              snoozeCount: 0
            });
          }
        }
      });
    };

    checkMedicineTimes();
    alarmCheckRef.current = setInterval(checkMedicineTimes, 60000);

    return () => {
      if (alarmCheckRef.current) {
        clearInterval(alarmCheckRef.current);
      }
    };
  }, [medicines, triggerAlarm]);

  // Load medicines from storage
  const loadMedicines = useCallback(async () => {
    try {
      setIsLoading(true);
      const stored = await AsyncStorage.getItem('medicine_reminders');
      if (stored) {
        setMedicines(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Load error:', error);
      Alert.alert('خطأ', 'فشل في تحميل البيانات');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save medicines to storage
  const saveMedicines = useCallback(async (medicineList: Medicine[]) => {
    try {
      await AsyncStorage.setItem('medicine_reminders', JSON.stringify(medicineList));
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('خطأ', 'فشل في حفظ البيانات');
    }
  }, []);

  // Refresh control
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMedicines();
    setRefreshing(false);
  }, [loadMedicines]);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  useEffect(() => {
    if (medicines.length >= 0) {
      saveMedicines(medicines);
    }
  }, [medicines, saveMedicines]);

  // Validation functions
  const validateMedicineName = (name: string) => name.trim().length >= 2;
  const validateDosage = (dosage: string) => dosage.trim().length >= 2;
  const validateTime = (time: string) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  const validateStock = (stock: string) => stock === '' || (!isNaN(Number(stock)) && Number(stock) >= 0);

  const validateForm = () => {
    const errors: ValidationErrors = {};
    if (!validateMedicineName(newMedicine.name)) {
      errors.name = 'اسم الدواء يجب أن يكون على الأقل حرفين';
    }
    if (!validateDosage(newMedicine.dosage)) {
      errors.dosage = 'الجرعة يجب أن تكون على الأقل حرفين';
    }
    if (newMedicine.times.some(time => !validateTime(time))) {
      errors.time = 'يرجى إدخال أوقات صحيحة';
    }
    if (!validateStock(newMedicine.stock)) {
      errors.stock = 'يرجى إدخال رقم صحيح للمخزون';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Get random color for medicine
  const getMedicineColor = (index: number) => {
    return MEDICINE_COLORS[index % MEDICINE_COLORS.length];
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
      times: newMedicine.times.filter(time => time.trim() !== ''),
      frequency: newMedicine.frequency,
      weeklyDays: newMedicine.frequency === 'weekly' ? newMedicine.weeklyDays : undefined,
      startDate: new Date().toISOString(),
      isActive: true,
      color: getMedicineColor(medicines.length),
      stock: newMedicine.stock ? Number(newMedicine.stock) : undefined,
      stockAlert: newMedicine.stockAlert ? Number(newMedicine.stockAlert) : undefined,
    };

    setMedicines([...medicines, medicine]);
    
    setNewMedicine({ 
      name: '', 
      dosage: '', 
      times: [''], 
      frequency: 'daily',
      weeklyDays: [],
      stock: '',
      stockAlert: '',
    });
    setValidationErrors({});
    setShowAddForm(false);
    
    Alert.alert('نجح', 'تم إضافة الدواء بنجاح');
  };

  // Add new time slot
  const addTimeSlot = () => {
    setNewMedicine({
      ...newMedicine,
      times: [...newMedicine.times, '']
    });
  };

  // Remove time slot
  const removeTimeSlot = (index: number) => {
    if (newMedicine.times.length > 1) {
      const newTimes = newMedicine.times.filter((_, i) => i !== index);
      setNewMedicine({
        ...newMedicine,
        times: newTimes
      });
    }
  };

  // Toggle weekly day
  const toggleWeeklyDay = (dayIndex: number) => {
    const currentDays = newMedicine.weeklyDays;
    const updatedDays = currentDays.includes(dayIndex)
      ? currentDays.filter(day => day !== dayIndex)
      : [...currentDays, dayIndex];
    
    setNewMedicine({
      ...newMedicine,
      weeklyDays: updatedDays
    });
  };

  // Toggle medicine active status
  const toggleMedicine = (id: string) => {
    setMedicines(prev => prev.map(med => 
      med.id === id ? { ...med, isActive: !med.isActive } : med
    ));
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
            setMedicines(prev => prev.filter(med => med.id !== id));
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
  const getTimeUntilNext = (medicine: Medicine) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // For weekly medicines, check if today is selected
    if (medicine.frequency === 'weekly' && !isWeeklyDayActive(medicine)) {
      return 'ليس اليوم';
    }
    
    const nextTimes = medicine.times.map(time => {
      const [hours, minutes] = time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;
      return timeInMinutes > currentTime ? timeInMinutes : timeInMinutes + 24 * 60;
    });
    
    const nextTime = Math.min(...nextTimes);
    const timeDiff = nextTime - currentTime;
    const hoursLeft = Math.floor(timeDiff / 60);
    const minutesLeft = timeDiff % 60;
    
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
      const newTimes = [...newMedicine.times];
      newTimes[currentTimeIndex] = timeString;
      setNewMedicine({...newMedicine, times: newTimes});
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

  const handleStockChange = (text: string) => {
    setNewMedicine({...newMedicine, stock: text});
    if (validationErrors.stock) {
      setValidationErrors({...validationErrors, stock: undefined});
    }
  };

  // Get statistics
  const getStatistics = () => {
    const activeMedicines = medicines.filter(med => med.isActive).length;
    const totalMedicines = medicines.length;
    const todayTaken = medicines.filter(med => {
      if (!med.lastTaken) return false;
      const lastTaken = new Date(med.lastTaken);
      const today = new Date();
      return lastTaken.toDateString() === today.toDateString();
    }).length;

    const lowStockMedicines = medicines.filter(med => 
      med.stock !== undefined && 
      med.stockAlert !== undefined && 
      med.stock <= med.stockAlert
    ).length;

    return { activeMedicines, totalMedicines, todayTaken, lowStockMedicines };
  };

  const stats = getStatistics();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#667EEA" />
        <View style={styles.loadingContainer}>
          <Animated.View style={[styles.loadingContent, { opacity: fadeAnimation }]}>
            <Text style={styles.loadingIcon}>💊</Text>
            <Text style={styles.loadingText}>جاري التحميل...</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667EEA" />
      
      <Animated.View style={[styles.header, { opacity: fadeAnimation }]}>
        <View style={styles.headerGradient}>
          <Text style={styles.headerTitle}>💊 تذكير الأدوية</Text>
          <Text style={styles.headerSubtitle}>اعتني بصحتك بذكاء</Text>
          
          {/* Enhanced Statistics */}
          <View style={styles.statsContainer}>
            <View style={[styles.statItem, styles.primaryStat]}>
              <Text style={styles.statNumber}>{stats.activeMedicines}</Text>
              <Text style={styles.statLabel}>نشط</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalMedicines}</Text>
              <Text style={styles.statLabel}>المجموع</Text>
            </View>
            <View style={[styles.statItem, styles.successStat]}>
              <Text style={styles.statNumber}>{stats.todayTaken}</Text>
              <Text style={styles.statLabel}>اليوم</Text>
            </View>
            {stats.lowStockMedicines > 0 && (
              <View style={[styles.statItem, styles.warningStat]}>
                <Text style={[styles.statNumber, styles.warningText]}>{stats.lowStockMedicines}</Text>
                <Text style={[styles.statLabel, styles.warningText]}>مخزون منخفض</Text>
              </View>
            )}
          </View>
          
          <View style={styles.statusIndicator}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>التذكيرات نشطة</Text>
          </View>
        </View>
      </Animated.View>

      {/* Enhanced Full Screen Alarm Modal */}
      <Modal
        visible={showAlarmModal}
        animationType="none"
        transparent={false}
        onRequestClose={() => {}} // Prevent closing with back button
      >
        <SafeAreaView style={styles.alarmContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
          
          <Animated.View style={[
            styles.alarmContent, 
            { 
              transform: [
                { scale: alarmScaleAnimation },
                { scale: pulseAnimation }
              ] 
            }
          ]}>
            <View style={styles.alarmIconContainer}>
              <View style={styles.alarmIconOuter}>
                <View style={styles.alarmIconInner}>
                  <Text style={styles.alarmIconText}>🚨</Text>
                </View>
              </View>
            </View>
            
            <Text style={styles.alarmTitle}>حان وقت الدواء!</Text>
            
            {activeAlarm && (
              <View style={styles.alarmDetails}>
                <View style={styles.medicineNameCard}>
                  <Text style={styles.alarmMedicineName}>{activeAlarm.medicineName}</Text>
                </View>
                <Text style={styles.alarmDosage}>{activeAlarm.dosage}</Text>
                <View style={styles.alarmTimeContainer}>
                  <Text style={styles.alarmTimeIcon}>🕐</Text>
                  <Text style={styles.alarmTime}>{formatTime(activeAlarm.time)}</Text>
                </View>
                {activeAlarm.snoozeCount > 0 && (
                  <View style={styles.snoozeCountContainer}>
                    <Text style={styles.snoozeCount}>
                      تم التأجيل {activeAlarm.snoozeCount} مرة
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            <View style={styles.alarmButtons}>
              <TouchableOpacity
                style={styles.takenAlarmButton}
                onPress={markAsTakenFromAlarm}
              >
                <Text style={styles.takenAlarmButtonText}>✅ تم تناول الدواء</Text>
              </TouchableOpacity>
              
              <View style={styles.alarmSecondaryButtons}>
                <TouchableOpacity
                  style={styles.snoozeAlarmButton}
                  onPress={snoozeAlarm}
                >
                  <Text style={styles.snoozeAlarmButtonText}>⏰ تأجيل 5 دقائق</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.stopAlarmButton}
                  onPress={stopAlarm}
                >
                  <Text style={styles.stopAlarmButtonText}>🔕 إيقاف</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      </Modal>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          style={[styles.addButton, showAddForm && styles.cancelButton]}
        >
          <View style={styles.addButtonContent}>
            <Text style={styles.addButtonIcon}>
              {showAddForm ? '❌' : '➕'}
            </Text>
            <Text style={styles.addButtonText}>
              {showAddForm ? 'إلغاء' : 'إضافة دواء جديد'}
            </Text>
          </View>
        </TouchableOpacity>

        <Modal visible={showAddForm} animationType="slide" presentationStyle="pageSheet">
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

            <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>اسم الدواء</Text>
                <TextInput
                  style={[styles.textInput, validationErrors.name && styles.errorInput]}
                  placeholder="مثال: أسبرين"
                  value={newMedicine.name}
                  onChangeText={handleNameChange}
                  textAlign="right"
                  autoCapitalize="words"
                />
                {validationErrors.name && (
                  <Text style={styles.errorText}>{validationErrors.name}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>الجرعة</Text>
                <TextInput
                  style={[styles.textInput, validationErrors.dosage && styles.errorInput]}
                  placeholder="مثال: حبة واحدة قبل الأكل"
                  value={newMedicine.dosage}
                  onChangeText={handleDosageChange}
                  textAlign="right"
                  multiline
                />
                {validationErrors.dosage && (
                  <Text style={styles.errorText}>{validationErrors.dosage}</Text>
                )}
              </View>

              {/* Multiple Times Section */}
              <View style={styles.inputContainer}>
                <View style={styles.timesHeader}>
                  <Text style={styles.inputLabel}>الأوقات</Text>
                  <TouchableOpacity onPress={addTimeSlot} style={styles.addTimeButton}>
                    <Text style={styles.addTimeButtonText}>+ إضافة وقت</Text>
                  </TouchableOpacity>
                </View>
                
                {newMedicine.times.map((time, index) => (
                  <View key={index} style={styles.timeSlotContainer}>
                    <TouchableOpacity
                      style={[styles.timeButton, validationErrors.time && styles.errorInput]}
                      onPress={() => {
                        setCurrentTimeIndex(index);
                        setShowTimePicker(true);
                      }}
                    >
                      <Text style={[styles.timeButtonText, !time && styles.placeholderText]}>
                        {time ? formatTime(time) : `اختر الوقت ${index + 1}`}
                      </Text>
                      <Text style={styles.timeIcon}>🕐</Text>
                    </TouchableOpacity>
                    
                    {newMedicine.times.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeTimeSlot(index)}
                        style={styles.removeTimeButton}
                      >
                        <Text style={styles.removeTimeButtonText}>❌</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                
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
                      📅 يومياً
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
                      📆 أسبوعياً
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Weekly Days Selection */}
              {newMedicine.frequency === 'weekly' && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>أيام الأسبوع</Text>
                  <View style={styles.weeklyDaysContainer}>
                    {DAYS_OF_WEEK.map((day, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.dayButton,
                          newMedicine.weeklyDays.includes(index) && styles.dayButtonActive
                        ]}
                        onPress={() => toggleWeeklyDay(index)}
                      >
                        <Text style={[
                          styles.dayButtonText,
                          newMedicine.weeklyDays.includes(index) && styles.dayButtonTextActive
                        ]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Stock Management */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>إدارة المخزون (اختياري)</Text>
                <View style={styles.stockContainer}>
                  <View style={styles.stockInputContainer}>
                    <Text style={styles.stockInputLabel}>العدد الحالي</Text>
                    <TextInput
                      style={[styles.stockInput, validationErrors.stock && styles.errorInput]}
                      placeholder="0"
                      value={newMedicine.stock}
                      onChangeText={handleStockChange}
                      keyboardType="numeric"
                      textAlign="center"
                    />
                  </View>
                  
                  <View style={styles.stockInputContainer}>
                    <Text style={styles.stockInputLabel}>تنبيه عند</Text>
                    <TextInput
                      style={styles.stockInput}
                      placeholder="5"
                      value={newMedicine.stockAlert}
                      onChangeText={(text) => setNewMedicine({...newMedicine, stockAlert: text})}
                      keyboardType="numeric"
                      textAlign="center"
                    />
                  </View>
                </View>
                {validationErrors.stock && (
                  <Text style={styles.errorText}>{validationErrors.stock}</Text>
                )}
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
            <Animated.View style={[styles.emptyState, { opacity: fadeAnimation }]}>
              <View style={styles.emptyStateIconContainer}>
                <Text style={styles.emptyStateIcon}>📋</Text>
              </View>
              <Text style={styles.emptyStateTitle}>لا توجد أدوية مضافة</Text>
              <Text style={styles.emptyStateText}>
                اضغط على إضافة دواء جديد لبدء إضافة أدويتك والحصول على تذكيرات ذكية
              </Text>
            </Animated.View>
          ) : (
            medicines.map((medicine, index) => (
              <Animated.View
                key={medicine.id}
                style={[
                  styles.medicineCard,
                  !medicine.isActive && styles.inactiveMedicineCard,
                  { opacity: fadeAnimation }
                ]}
              >
                <View style={styles.medicineHeader}>
                  <View style={styles.medicineInfo}>
                    <View style={styles.medicineNameContainer}>
                      <View 
                        style={[
                          styles.colorIndicator, 
                          { backgroundColor: medicine.color || getMedicineColor(index) }
                        ]} 
                      />
                      <Text style={styles.medicineName}>💊 {medicine.name}</Text>
                      {medicine.stock !== undefined && medicine.stockAlert !== undefined && 
                       medicine.stock <= medicine.stockAlert && (
                        <View style={styles.lowStockBadge}>
                          <Text style={styles.lowStockBadgeText}>⚠️</Text>
                        </View>
                      )}
                    </View>
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
                    <Text style={styles.detailLabel}>🕐 الأوقات:</Text>
                    <View style={styles.timesContainer}>
                      {medicine.times.map((time, timeIndex) => (
                        <View key={timeIndex} style={styles.timeChip}>
                          <Text style={styles.timeChipText}>{formatTime(time)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>📅 التكرار:</Text>
                    <View style={styles.frequencyDisplay}>
                      <View style={styles.frequencyChip}>
                        <Text style={styles.frequencyChipText}>
                          {medicine.frequency === 'daily' ? 'يومياً' : 'أسبوعياً'}
                        </Text>
                      </View>
                      {medicine.frequency === 'weekly' && medicine.weeklyDays && (
                        <Text style={styles.weeklyDaysDisplay}>
                          ({medicine.weeklyDays.map(day => DAYS_OF_WEEK[day]).join('، ')})
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Enhanced Stock Information */}
                  {medicine.stock !== undefined && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>📦 المخزون:</Text>
                      <View style={styles.stockDisplay}>
                        <View style={[
                          styles.stockChip,
                          medicine.stockAlert && medicine.stock <= medicine.stockAlert ? styles.lowStockChip : null
                        ]}>
                          <Text style={[
                            styles.stockChipText,
                            medicine.stockAlert && medicine.stock <= medicine.stockAlert ? styles.lowStockChipText : null
                          ]}>
                            {medicine.stock} متبقي
                          </Text>
                        </View>
                        {medicine.stockAlert && (
                          <Text style={styles.stockAlertText}>
                            تنبيه عند {medicine.stockAlert}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {medicine.isActive && (
                    <View style={styles.detailRow}>
                      <Text style={styles.nextDoseLabel}>⏳ الجرعة التالية:</Text>
                      <View style={styles.nextDoseChip}>
                        <Text style={styles.nextDoseText}>
                          {getTimeUntilNext(medicine)}
                        </Text>
                      </View>
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
                    style={[styles.takenButton, { backgroundColor: medicine.color || getMedicineColor(index) }]}
                  >
                    <Text style={styles.takenButtonText}>✅ تم تناول الدواء</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
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
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingContent: {
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 20,
    elevation: 5,
  },
  loadingIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: '#64748B',
    fontFamily: 'System',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#667EEA',
  },
  headerGradient: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
    fontFamily: 'System',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E0E7FF',
    textAlign: 'center',
    fontFamily: 'System',
    fontWeight: '500',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#5A67D8',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#4C51BF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  primaryStat: {
    backgroundColor: '#047857',
  },
  successStat: {
    backgroundColor: '#059669',
  },
  warningStat: {
    backgroundColor: '#DC2626',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    fontFamily: 'System',
  },
  statLabel: {
    fontSize: 12,
    color: 'white',
    marginTop: 2,
    fontFamily: 'System',
    fontWeight: '500',
  },
  warningText: {
    color: 'white',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#047857',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10F981',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    fontFamily: 'System',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: 'white',
  },
  addButton: {
    backgroundColor: '#10B981',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginVertical: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  addButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButtonIcon: {
    fontSize: 20,
    color: 'white',
  },
  addButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'System',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#667EEA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
    fontFamily: 'System',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#4C51BF',
  },
  closeButtonText: {
    fontSize: 18,
    color: 'white',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: 'white',
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    textAlign: 'right',
    fontFamily: 'System',
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: 'white',
    minHeight: 52,
    fontFamily: 'System',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  errorInput: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'right',
    fontFamily: 'System',
    fontWeight: '500',
  },
  timesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addTimeButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addTimeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'System',
  },
  timeSlotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  timeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    minHeight: 52,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#374151',
    fontFamily: 'System',
    fontWeight: '500',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  timeIcon: {
    fontSize: 20,
  },
  removeTimeButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
  },
  removeTimeButtonText: {
    fontSize: 16,
    color: '#EF4444',
  },
  frequencyContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  frequencyButtonActive: {
    borderColor: '#667EEA',
    backgroundColor: '#667EEA',
  },
  frequencyButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
  },
  frequencyButtonTextActive: {
    color: 'white',
  },
  weeklyDaysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dayButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayButtonActive: {
    borderColor: '#667EEA',
    backgroundColor: '#667EEA',
  },
  dayButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    fontFamily: 'System',
  },
  dayButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  stockContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  stockInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  stockInputLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
    fontFamily: 'System',
    fontWeight: '500',
  },
  stockInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: 'white',
    minHeight: 52,
    width: '100%',
    fontFamily: 'System',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: '#10B981',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'System',
  },
  medicinesList: {
    paddingBottom: 20,
    backgroundColor: 'white',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
    backgroundColor: 'white',
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyStateIcon: {
    fontSize: 64,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'System',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'System',
    maxWidth: 300,
  },
  medicineCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 6,
    borderLeftColor: '#667EEA',
  },
  inactiveMedicineCard: {
    opacity: 0.6,
    borderLeftColor: '#9CA3AF',
  },
  medicineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  medicineInfo: {
    flex: 1,
    marginRight: 12,
  },
  medicineNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  colorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  medicineName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    fontFamily: 'System',
    flex: 1,
  },
  lowStockBadge: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  lowStockBadgeText: {
    fontSize: 14,
    color: '#DC2626',
  },
  medicineDosage: {
    fontSize: 15,
    color: '#6B7280',
    fontFamily: 'System',
    fontWeight: '500',
  },
  medicineActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activeButton: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  inactiveButton: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  actionButtonText: {
    fontSize: 16,
  },
  medicineDetails: {
    marginBottom: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'System',
    marginRight: 8,
  },
  timesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  timeChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeChipText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
    fontFamily: 'System',
  },
  frequencyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  frequencyChip: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  frequencyChipText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    fontFamily: 'System',
  },
  weeklyDaysDisplay: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'System',
  },
  stockDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stockChipText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
    fontFamily: 'System',
  },
  lowStockChip: {
    backgroundColor: '#FEF2F2',
  },
  lowStockChipText: {
    color: '#DC2626',
  },
  stockAlertText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontFamily: 'System',
  },
  nextDoseLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'System',
  },
  nextDoseChip: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nextDoseText: {
    fontSize: 14,
    color: '#D97706',
    fontWeight: '600',
    fontFamily: 'System',
  },
  lastTakenLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
    fontFamily: 'System',
  },
  lastTakenValue: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'System',
  },
  takenButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  takenButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
  },
  alarmContainer: {
    flex: 1,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmContent: {
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  alarmIconContainer: {
    marginBottom: 32,
  },
  alarmIconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmIconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmIconText: {
    fontSize: 48,
  },
  alarmTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'System',
  },
  alarmDetails: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  medicineNameCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  alarmMedicineName: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    fontFamily: 'System',
  },
  alarmDosage: {
    fontSize: 18,
    color: 'white',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'System',
    fontWeight: '500',
  },
  alarmTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alarmTimeIcon: {
    fontSize: 24,
  },
  alarmTime: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    fontFamily: 'System',
  },
  snoozeCountContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  snoozeCount: {
    fontSize: 14,
    color: 'white',
    fontFamily: 'System',
    fontWeight: '500',
  },
  alarmButtons: {
    width: '100%',
    gap: 16,
  },
  takenAlarmButton: {
    backgroundColor: '#10B981',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  takenAlarmButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'System',
  },
  alarmSecondaryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  snoozeAlarmButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'white',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  snoozeAlarmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
  },
  stopAlarmButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'white',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  stopAlarmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
  },
});

export default MedicineReminderApp;