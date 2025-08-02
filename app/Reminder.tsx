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
  Animated as RNAnimated,
  RefreshControl,
  AppState,
  AppStateStatus,
  Dimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
const { width} = Dimensions.get('window');

// Enhanced Medicine interface with categories
interface Medicine {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  frequency: 'daily' | 'weekly';
  weeklyDays?: number[];
  startDate: string;
  isActive: boolean;
  lastTaken?: string;
  color?: string;
  stock?: number;
  stockAlert?: number;
  category: MedicineCategory;
  icon: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes?: string;
}

type MedicineCategory = 'heart' | 'brain' | 'pain' | 'vitamin' | 'antibiotic' | 'diabetes' | 'blood' | 'respiratory' | 'digestive' | 'other';

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

// Enhanced category configuration with icons and colors
const MEDICINE_CATEGORIES = {
  heart: { 
    name: 'القلب والأوعية الدموية', 
    icon: '❤️', 
    color: ['#FF6B6B', '#FF8E8E'],
    bgColor: '#FFF0F0'
  },
  brain: { 
    name: 'الجهاز العصبي', 
    icon: '🧠', 
    color: ['#9B59B6', '#BB6BD9'],
    bgColor: '#F8F0FF'
  },
  pain: { 
    name: 'المسكنات والمضادة للالتهاب', 
    icon: '💊', 
    color: ['#3498DB', '#5DADE2'],
    bgColor: '#EBF5FF'
  },
  vitamin: { 
    name: 'الفيتامينات والمكملات', 
    icon: '🌟', 
    color: ['#F39C12', '#F5B041'],
    bgColor: '#FFF8E1'
  },
  antibiotic: { 
    name: 'المضادات الحيوية', 
    icon: '🦠', 
    color: ['#E74C3C', '#EC7063'],
    bgColor: '#FFEBEE'
  },
  diabetes: { 
    name: 'السكري', 
    icon: '🩸', 
    color: ['#27AE60', '#58D68D'],
    bgColor: '#E8F5E8'
  },
  blood: { 
    name: 'ضغط الدم', 
    icon: '🫀', 
    color: ['#8E44AD', '#A569BD'],
    bgColor: '#F4EFF8'
  },
  respiratory: { 
    name: 'الجهاز التنفسي', 
    icon: '🫁', 
    color: ['#16A085', '#48C9B0'],
    bgColor: '#E0F7F4'
  },
  digestive: { 
    name: 'الجهاز الهضمي', 
    icon: '🍃', 
    color: ['#2ECC71', '#5DADE2'],
    bgColor: '#E8F8F5'
  },
  other: { 
    name: 'أخرى', 
    icon: '💉', 
    color: ['#95A5A6', '#BDC3C7'],
    bgColor: '#F8F9FA'
  }
};

// Priority configuration
const PRIORITY_CONFIG = {
  low: { name: 'منخفضة', icon: '🟢', color: '#27AE60' },
  medium: { name: 'متوسطة', icon: '🟡', color: '#F39C12' },
  high: { name: 'عالية', icon: '🟠', color: '#E67E22' },
  critical: { name: 'حرجة', icon: '🔴', color: '#E74C3C' }
};

const DAYS_OF_WEEK = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const MedicineReminderApp: React.FC = () => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'priority' | 'category'>('time');
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    dosage: '',
    times: [''],
    frequency: 'daily' as 'daily' | 'weekly',
    weeklyDays: [] as number[],
    stock: '',
    stockAlert: '',
    category: 'other' as MedicineCategory,
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    notes: '',
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
  const vibrationRef = useRef<NodeJS.Timeout | null>(null);
  const alarmCheckRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animation values
  const pulseAnimation = useRef(new RNAnimated.Value(1)).current;
  const fadeAnimation = useRef(new RNAnimated.Value(0)).current;
  const alarmScaleAnimation = useRef(new RNAnimated.Value(0)).current;
  const headerAnimation = useRef(new RNAnimated.Value(0)).current;
  const cardAnimations = useRef<RNAnimated.Value[]>([]).current;
  const floatingAnimation = useRef(new RNAnimated.Value(0)).current;

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousAppState = appState;
      setAppState(nextAppState);
      
      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
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

  // Enhanced initialization animations
  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(fadeAnimation, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      RNAnimated.timing(headerAnimation, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();

    const floatingLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(floatingAnimation, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(floatingAnimation, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    floatingLoop.start();

    return () => floatingLoop.stop();
  }, [fadeAnimation, headerAnimation, floatingAnimation]);

  // card animations
  useEffect(() => {
  if (medicines.length > 0) {
    const animations = medicines.map((_, index) => {
      if (!cardAnimations[index]) {
        cardAnimations[index] = new RNAnimated.Value(0);
      }
      return RNAnimated.timing(cardAnimations[index], {
        toValue: 1,
        duration: 500,
        delay: index * 100,
        useNativeDriver: true,
      });
    });

    RNAnimated.stagger(100, animations).start();
  }
}, [medicines, cardAnimations]);


  // Enhanced pulse animation for alarm
  useEffect(() => {
    if (showAlarmModal) {
      RNAnimated.spring(alarmScaleAnimation, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();

      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnimation, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          RNAnimated.timing(pulseAnimation, {
            toValue: 0.9,
            duration: 800,
            useNativeDriver: true,
          }),
          RNAnimated.timing(pulseAnimation, {
            toValue: 1,
            duration: 400,
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
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sound/alarm.mp3'),
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
    Alert.alert('تم ✅', 'تم تسجيل تناول الدواء بنجاح', [
      { text: 'حسناً', style: 'default' }
    ]);
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
    if (activeAlarm) return;

    setActiveAlarm(alarmData);
    setShowAlarmModal(true);

    await playAlarmSound();

    const vibrationPattern = [0, 1000, 500, 1000, 500, 1000];
    Vibration.vibrate(vibrationPattern, true);
    
    vibrationRef.current = setInterval(() => {
      Vibration.vibrate([500, 300, 500, 300]);
    }, 4000) as unknown as NodeJS.Timeout;

  }, [activeAlarm, playAlarmSound]);

  // Snooze alarm for 5 minutes
  const snoozeAlarm = useCallback(async () => {
    if (activeAlarm) {
      await stopAlarm();
      
      setTimeout(() => {
        const snoozedAlarm = {
          ...activeAlarm,
          snoozeCount: activeAlarm.snoozeCount + 1
        };
        triggerAlarm(snoozedAlarm);
      }, 5 * 60 * 1000);
      
      Alert.alert('تأجيل ⏰', 'تم تأجيل المنبه لمدة 5 دقائق');
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
  const isWeeklyDayActive = useCallback((medicine: Medicine): boolean => {
    if (medicine.frequency !== 'weekly' || !medicine.weeklyDays) return true;
    const today = new Date().getDay();
    return medicine.weeklyDays.includes(today);
  }, []);

  // Check for medicine times every minute
  useEffect(() => {
    const checkMedicineTimes = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      medicines.forEach(medicine => {
        if (medicine.isActive && medicine.times.includes(currentTime)) {
          if (medicine.frequency === 'weekly' && !isWeeklyDayActive(medicine)) {
            return;
          }

          const lastTaken = medicine.lastTaken ? new Date(medicine.lastTaken) : null;
          const timeSinceLastTaken = lastTaken ? (now.getTime() - lastTaken.getTime()) / (1000 * 60) : Infinity;
          
          if (timeSinceLastTaken > 1) {
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
    alarmCheckRef.current = setInterval(checkMedicineTimes, 60000) as unknown as NodeJS.Timeout;

    return () => {
      if (alarmCheckRef.current) {
        clearInterval(alarmCheckRef.current);
      }
    };
  }, [medicines, triggerAlarm, isWeeklyDayActive]);

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

  // Get gradient colors for medicine
  const getMedicineColors = (category: MedicineCategory) => {
    return MEDICINE_CATEGORIES[category].color as [string, string];
  };

  // Add new medicine with animation
  const addMedicine = () => {
    if (!validateForm()) {
      Alert.alert('خطأ ❌', 'يرجى تصحيح الأخطاء المحددة');
      return;
    }

    if (medicines.some(med => med.name.toLowerCase() === newMedicine.name.toLowerCase())) {
      Alert.alert('خطأ ❌', 'يوجد دواء بهذا الاسم مسبقاً');
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
      color: getMedicineColors(newMedicine.category)[0],
      stock: newMedicine.stock ? Number(newMedicine.stock) : undefined,
      stockAlert: newMedicine.stockAlert ? Number(newMedicine.stockAlert) : undefined,
      category: newMedicine.category,
      icon: MEDICINE_CATEGORIES[newMedicine.category].icon,
      priority: newMedicine.priority,
      notes: newMedicine.notes.trim(),
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
      category: 'other',
      priority: 'medium',
      notes: '',
    });
    setValidationErrors({});
    setShowAddForm(false);
    
    Alert.alert('نجح ✅', 'تم إضافة الدواء بنجاح إلى قائمة التذكيرات', [
      { text: 'رائع!', style: 'default' }
    ]);
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

  // Delete medicine with confirmation
  const deleteMedicine = (id: string) => {
    Alert.alert(
      'تأكيد الحذف 🗑️',
      'هل أنت متأكد من حذف هذا الدواء نهائياً؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            setMedicines(prev => prev.filter(med => med.id !== id));
            Alert.alert('تم الحذف ✅', 'تم حذف الدواء من قائمة التذكيرات');
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

  // Filter and sort medicines
  const getFilteredAndSortedMedicines = () => {
    let filtered = medicines;
    
    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(med => med.category === selectedCategory);
    }
    
    // Sort medicines
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, 'ar');
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'category':
          return a.category.localeCompare(b.category);
        case 'time':
        default:
          if (a.times[0] && b.times[0]) {
            return a.times[0].localeCompare(b.times[0]);
          }
          return 0;
      }
    });
    
    return filtered;
  };

  // Get enhanced statistics
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

    const criticalMedicines = medicines.filter(med => med.priority === 'critical').length;

    // Category breakdown
    const categoryStats: Record<string, number> = {};
    medicines.forEach(med => {
      categoryStats[med.category] = (categoryStats[med.category] || 0) + 1;
    });

    return { 
      activeMedicines, 
      totalMedicines, 
      todayTaken, 
      lowStockMedicines, 
      criticalMedicines,
      categoryStats
    };
  };

  const stats = getStatistics();
  const filteredMedicines = getFilteredAndSortedMedicines();

  if (isLoading) {
    return (
      <LinearGradient
        colors={['#667EEA', '#764BA2'] as [string, string]}
        style={styles.container}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#667EEA" />
          <View style={styles.loadingContainer}>
            <RNAnimated.View style={[styles.loadingContent, { opacity: fadeAnimation }]}>
              <RNAnimated.View style={[
                styles.loadingIconContainer,
                {
                  transform: [{
                    rotate: floatingAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }]
                }
              ]}>
                <Text style={styles.loadingIcon}>💊</Text>
              </RNAnimated.View>
              <Text style={styles.loadingText}>جاري التحميل...</Text>
              <View style={styles.loadingBar}>
                <RNAnimated.View style={[
                  styles.loadingProgress,
                  {
                    transform: [{
                      scaleX: fadeAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1]
                      })
                    }]
                  }
                ]} />
              </View>
            </RNAnimated.View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667EEA" />
      
      {/* Enhanced Header with Gradient */}
      <LinearGradient
        colors={['#667EEA', '#764BA2', '#667EEA'] as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <RNAnimated.View style={[
          styles.header,
          {
            opacity: headerAnimation,
            transform: [{
              translateY: headerAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0]
              })
            }]
          }
        ]}>
          {/* Floating Decorative Elements */}
          <RNAnimated.View style={[
            styles.floatingDecor,
            styles.floatingDecor1,
            {
              transform: [{
                translateY: floatingAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10]
                })
              }]
            }
          ]}>
            <Text style={styles.decorEmoji}>✨</Text>
          </RNAnimated.View>
          
          <RNAnimated.View style={[
            styles.floatingDecor,
            styles.floatingDecor2,
            {
              transform: [{
                translateY: floatingAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 15]
                })
              }]
            }
          ]}>
            <Text style={styles.decorEmoji}>🏥</Text>
          </RNAnimated.View>

          <View style={styles.headerContent}>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>💊 تذكير الأدوية</Text>
              <Text style={styles.headerSubtitle}>اعتني بصحتك بذكاء وعناية</Text>
            </View>
            
            {/* Enhanced Statistics Dashboard */}
            <View style={styles.statsContainer}>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.primaryStatCard]}>
                  <LinearGradient
                    colors={['#10B981', '#059669'] as [string, string]}
                    style={styles.statCardGradient}
                  >
                    <Text style={styles.statNumber}>{stats.activeMedicines}</Text>
                    <Text style={styles.statLabel}>نشط</Text>
                    <Text style={styles.statIcon}>🟢</Text>
                  </LinearGradient>
                </View>
                
                <View style={[styles.statCard, styles.secondaryStatCard]}>
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB'] as [string, string]}
                    style={styles.statCardGradient}
                  >
                    <Text style={styles.statNumber}>{stats.totalMedicines}</Text>
                    <Text style={styles.statLabel}>المجموع</Text>
                    <Text style={styles.statIcon}>📊</Text>
                  </LinearGradient>
                </View>
                
                <View style={[styles.statCard, styles.successStatCard]}>
                  <LinearGradient
                    colors={['#059669', '#047857'] as [string, string]}
                    style={styles.statCardGradient}
                  >
                    <Text style={styles.statNumber}>{stats.todayTaken}</Text>
                    <Text style={styles.statLabel}>اليوم</Text>
                    <Text style={styles.statIcon}>✅</Text>
                  </LinearGradient>
                </View>
                
                {stats.criticalMedicines > 0 && (
                  <View style={[styles.statCard, styles.criticalStatCard]}>
                    <LinearGradient
                      colors={['#DC2626', '#B91C1C'] as [string, string]}
                      style={styles.statCardGradient}
                    >
                      <Text style={styles.statNumber}>{stats.criticalMedicines}</Text>
                      <Text style={styles.statLabel}>حرجة</Text>
                      <Text style={styles.statIcon}>🔴</Text>
                    </LinearGradient>
                  </View>
                )}
                
                {stats.lowStockMedicines > 0 && (
                  <View style={[styles.statCard, styles.warningStatCard]}>
                    <LinearGradient
                      colors={['#F59E0B', '#D97706'] as [string, string]}
                      style={styles.statCardGradient}
                    >
                      <Text style={styles.statNumber}>{stats.lowStockMedicines}</Text>
                      <Text style={styles.statLabel}>مخزون منخفض</Text>
                      <Text style={styles.statIcon}>⚠️</Text>
                    </LinearGradient>
                  </View>
                )}
              </View>
            </View>
            
            {/* Enhanced Status Indicator */}
            <View style={styles.statusIndicatorContainer}>
              <LinearGradient
                colors={['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.1)'] as [string, string]}
                style={styles.statusIndicator}
              >
                <RNAnimated.View style={[
                  styles.statusDot,
                  {
                    transform: [{
                      scale: pulseAnimation.interpolate({
                        inputRange: [0.9, 1.2],
                        outputRange: [0.8, 1.2],
                        extrapolate: 'clamp'
                      })
                    }]
                  }
                ]} />
                <Text style={styles.statusText}>التذكيرات نشطة الآن</Text>
                <Text style={styles.statusSubtext}>المراقبة المستمرة 24/7</Text>
              </LinearGradient>
            </View>
          </View>
        </RNAnimated.View>
      </LinearGradient>

      {/* Enhanced Full Screen Alarm Modal */}
      <Modal
        visible={showAlarmModal}
        animationType="none"
        transparent={false}
        onRequestClose={() => {}}
      >
        <LinearGradient
          colors={['#DC2626', '#B91C1C', '#991B1B'] as [string, string, string]}
          style={styles.alarmContainer}
        >
          <SafeAreaView style={styles.alarmContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
            
            {/* Animated Background Pattern */}
            <View style={styles.alarmBackgroundPattern}>
              {[...Array(20)].map((_, i) => (
                <RNAnimated.View
                  key={i}
                  style={[
                    styles.patternDot,
                    {
                      left: (i % 5) * 20,
                      top: Math.floor(i / 5) * 25,
                      transform: [{
                        scale: pulseAnimation.interpolate({
                          inputRange: [0.9, 1.2],
                          outputRange: [0.3, 0.8],
                          extrapolate: 'clamp'
                        })
                      }]
                    }
                  ]}
                />
              ))}
            </View>
            
            <RNAnimated.View style={[
              styles.alarmContent, 
              { 
                transform: [
                  { scale: alarmScaleAnimation },
                  { scale: pulseAnimation }
                ] 
              }
            ]}>
              {/* Enhanced Alarm Icon */}
              <View style={styles.alarmIconContainer}>
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.1)'] as [string, string]}
                  style={styles.alarmIconOuter}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0.2)'] as [string, string]}
                    style={styles.alarmIconInner}
                  >
                    <Text style={styles.alarmIconText}>🚨</Text>
                    <View style={styles.alarmIconRing} />
                  </LinearGradient>
                </LinearGradient>
              </View>
              
              <Text style={styles.alarmTitle}>حان وقت الدواء!</Text>
              <Text style={styles.alarmSubtitle}>لا تنسى العناية بصحتك</Text>
              
              {activeAlarm && (
                <View style={styles.alarmDetails}>
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'] as [string, string]}
                    style={styles.medicineNameCard}
                  >
                    <Text style={styles.alarmMedicineName}>💊 {activeAlarm.medicineName}</Text>
                  </LinearGradient>
                  
                  <View style={styles.alarmInfoGrid}>
                    <View style={styles.alarmInfoItem}>
                      <Text style={styles.alarmInfoIcon}>💉</Text>
                      <Text style={styles.alarmDosage}>{activeAlarm.dosage}</Text>
                    </View>
                    
                    <View style={styles.alarmInfoItem}>
                      <Text style={styles.alarmInfoIcon}>🕐</Text>
                      <Text style={styles.alarmTime}>{formatTime(activeAlarm.time)}</Text>
                    </View>
                  </View>
                  
                  {activeAlarm.snoozeCount > 0 && (
                    <LinearGradient
                      colors={['rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.2)'] as [string, string]}
                      style={styles.snoozeCountContainer}
                    >
                      <Text style={styles.snoozeCount}>
                        🔄 تم التأجيل {activeAlarm.snoozeCount} مرة
                      </Text>
                    </LinearGradient>
                  )}
                </View>
              )}
              
              <View style={styles.alarmButtons}>
                <TouchableOpacity
                  style={styles.takenAlarmButton}
                  onPress={markAsTakenFromAlarm}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669'] as [string, string]}
                    style={styles.alarmButtonGradient}
                  >
                    <Text style={styles.takenAlarmButtonText}>✅ تم تناول الدواء</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <View style={styles.alarmSecondaryButtons}>
                  <TouchableOpacity
                    style={styles.snoozeAlarmButton}
                    onPress={snoozeAlarm}
                  >
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'] as [string, string]}
                      style={styles.alarmButtonGradient}
                    >
                      <Text style={styles.snoozeAlarmButtonText}>⏰ تأجيل 5 دقائق</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.stopAlarmButton}
                    onPress={stopAlarm}
                  >
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'] as [string, string]}
                      style={styles.alarmButtonGradient}
                    >
                      <Text style={styles.stopAlarmButtonText}>🔕 إيقاف</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </RNAnimated.View>
          </SafeAreaView>
        </LinearGradient>
      </Modal>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#667EEA"
            colors={['#667EEA', '#764BA2'] as [string, string]}
          />
        }
      >
        {/* Enhanced Category Filter Bar */}
        <View style={styles.filterBar}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScrollView}
            contentContainerStyle={styles.categoryScrollContainer}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory('all')}
              style={styles.categoryFilterContainer}
            >
              <LinearGradient
                colors={selectedCategory === 'all' ? ['#667EEA', '#764BA2'] as [string, string] : ['#F3F4F6', '#E5E7EB'] as [string, string]}
                style={styles.categoryFilter}
              >
                <Text style={styles.categoryFilterIcon}>🏥</Text>
                <Text style={[
                  styles.categoryFilterText,
                  selectedCategory === 'all' && styles.categoryFilterTextActive
                ]}>
                  الكل ({stats.totalMedicines})
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            
            {Object.entries(MEDICINE_CATEGORIES).map(([key, category]) => {
              const count = stats.categoryStats[key] || 0;
              if (count === 0) return null;
              
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSelectedCategory(key)}
                  style={styles.categoryFilterContainer}
                >
                  <LinearGradient
                    colors={selectedCategory === key ? category.color as [string, string] : ['#F3F4F6', '#E5E7EB'] as [string, string]}
                    style={styles.categoryFilter}
                  >
                    <Text style={styles.categoryFilterIcon}>{category.icon}</Text>
                    <Text style={[
                      styles.categoryFilterText,
                      selectedCategory === key && styles.categoryFilterTextActive
                    ]}>
                      {category.name.split(' ')[0]} ({count})
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Enhanced Sort Options */}
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>🔄 ترتيب حسب:</Text>
          <View style={styles.sortButtons}>
            {[
              { key: 'time', label: 'الوقت', icon: '🕐' },
              { key: 'priority', label: 'الأولوية', icon: '⚡' },
              { key: 'category', label: 'الفئة', icon: '📂' },
              { key: 'name', label: 'الاسم', icon: '🔤' }
            ].map((sort) => (
              <TouchableOpacity
                key={sort.key}
                onPress={() => setSortBy(sort.key as any)}
                style={styles.sortButtonContainer}
              >
                <LinearGradient
                  colors={sortBy === sort.key ? ['#667EEA', '#764BA2'] as [string, string] : ['#F9FAFB', '#F3F4F6'] as [string, string]}
                  style={styles.sortButton}
                >
                  <Text style={styles.sortButtonIcon}>{sort.icon}</Text>
                  <Text style={[
                    styles.sortButtonText,
                    sortBy === sort.key && styles.sortButtonTextActive
                  ]}>
                    {sort.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Enhanced Add Button */}
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          style={styles.addButtonContainer}
        >
          <LinearGradient
            colors={showAddForm ? ['#EF4444', '#DC2626'] as [string, string] : ['#10B981', '#059669'] as [string, string]}
            style={styles.addButton}
          >
            <View style={styles.addButtonContent}>
              <RNAnimated.View style={[
                styles.addButtonIconContainer,
                {
                  transform: [{
                    rotate: showAddForm ? '45deg' : '0deg'
                  }]
                }
              ]}>
                <Text style={styles.addButtonIcon}>
                  {showAddForm ? '✕' : '➕'}
                </Text>
              </RNAnimated.View>
              <View style={styles.addButtonTextContainer}>
                <Text style={styles.addButtonText}>
                  {showAddForm ? 'إلغاء الإضافة' : 'إضافة دواء جديد'}
                </Text>
                <Text style={styles.addButtonSubtext}>
                  {showAddForm ? 'العودة للقائمة' : 'ابدأ في إضافة دواء'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Enhanced Add Medicine Modal */}
        <Modal visible={showAddForm} animationType="slide" presentationStyle="pageSheet">
          <LinearGradient
            colors={['#F8FAFC', '#FFFFFF'] as [string, string]}
            style={styles.modalContainer}
          >
            <SafeAreaView style={styles.modalContainer}>
              {/* Enhanced Modal Header */}
              <LinearGradient
                colors={['#667EEA', '#764BA2'] as [string, string]}
                style={styles.modalHeader}
              >
                <View style={styles.modalHeaderContent}>
                  <View style={styles.modalTitleContainer}>
                    <Text style={styles.modalTitle}>إضافة دواء جديد</Text>
                    <Text style={styles.modalSubtitle}>املأ المعلومات المطلوبة</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowAddForm(false)}
                    style={styles.closeButton}
                  >
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'] as [string, string]}
                      style={styles.closeButtonGradient}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
                {/* Enhanced Category Selection */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>🏷️ فئة الدواء</Text>
                  <View style={styles.categoryGrid}>
                    {Object.entries(MEDICINE_CATEGORIES).map(([key, category]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setNewMedicine({...newMedicine, category: key as MedicineCategory})}
                        style={styles.categoryOptionContainer}
                      >
                        <LinearGradient
                          colors={newMedicine.category === key ? category.color as [string, string] : ['#F9FAFB', '#F3F4F6'] as [string, string]}
                          style={styles.categoryOption}
                        >
                          <Text style={styles.categoryOptionIcon}>{category.icon}</Text>
                          <Text style={[
                            styles.categoryOptionText,
                            newMedicine.category === key && styles.categoryOptionTextActive
                          ]}>
                            {category.name}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Enhanced Priority Selection */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>⚡ مستوى الأولوية</Text>
                  <View style={styles.priorityContainer}>
                    {Object.entries(PRIORITY_CONFIG).map(([key, priority]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setNewMedicine({...newMedicine, priority: key as any})}
                        style={styles.priorityOptionContainer}
                      >
                        <LinearGradient
                          colors={newMedicine.priority === key 
                            ? [priority.color, priority.color + '99'] as [string, string]
                            : ['#F9FAFB', '#F3F4F6'] as [string, string]
                          }
                          style={styles.priorityOption}
                        >
                          <Text style={styles.priorityOptionIcon}>{priority.icon}</Text>
                          <Text style={[
                            styles.priorityOptionText,
                            newMedicine.priority === key && styles.priorityOptionTextActive
                          ]}>
                            {priority.name}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Enhanced Input Fields */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    {MEDICINE_CATEGORIES[newMedicine.category].icon} اسم الدواء
                  </Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.textInput, validationErrors.name && styles.errorInput]}
                      placeholder="مثال: أسبرين، باراسيتامول..."
                      placeholderTextColor="#9CA3AF"
                      value={newMedicine.name}
                      onChangeText={handleNameChange}
                      textAlign="right"
                      autoCapitalize="words"
                    />
                    {validationErrors.name && (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorText}>{validationErrors.name}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>💊 الجرعة والتعليمات</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.textInput, styles.multilineInput, validationErrors.dosage && styles.errorInput]}
                      placeholder="مثال: حبة واحدة قبل الأكل بنصف ساعة"
                      placeholderTextColor="#9CA3AF"
                      value={newMedicine.dosage}
                      onChangeText={handleDosageChange}
                      textAlign="right"
                      multiline
                      numberOfLines={3}
                    />
                    {validationErrors.dosage && (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorText}>{validationErrors.dosage}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Enhanced Notes Section */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>📝 ملاحظات إضافية (اختياري)</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.textInput, styles.multilineInput]}
                      placeholder="أي ملاحظات مهمة أو تعليمات خاصة..."
                      placeholderTextColor="#9CA3AF"
                      value={newMedicine.notes}
                      onChangeText={(text) => setNewMedicine({...newMedicine, notes: text})}
                      textAlign="right"
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </View>

                {/* Enhanced Multiple Times Section */}
                <View style={styles.inputContainer}>
                  <View style={styles.timesHeader}>
                    <Text style={styles.inputLabel}>🕐 الأوقات</Text>
                    <TouchableOpacity onPress={addTimeSlot} style={styles.addTimeButton}>
                      <LinearGradient
                        colors={['#10B981', '#059669'] as [string, string]}
                        style={styles.addTimeButtonGradient}
                      >
                        <Text style={styles.addTimeButtonIcon}>➕</Text>
                        <Text style={styles.addTimeButtonText}>إضافة وقت</Text>
                      </LinearGradient>
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
                        <LinearGradient
                          colors={time ? ['#EFF6FF', '#DBEAFE'] as [string, string] : ['#F9FAFB', '#F3F4F6'] as [string, string]}
                          style={styles.timeButtonGradient}
                        >
                          <View style={styles.timeButtonContent}>
                            <Text style={[styles.timeButtonText, !time && styles.placeholderText]}>
                              {time ? formatTime(time) : `اختر الوقت ${index + 1}`}
                            </Text>
                            <Text style={styles.timeIcon}>🕐</Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                      
                      {newMedicine.times.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeTimeSlot(index)}
                          style={styles.removeTimeButton}
                        >
                          <LinearGradient
                            colors={['#FEF2F2', '#FEE2E2'] as [string, string]}
                            style={styles.removeTimeButtonGradient}
                          >
                            <Text style={styles.removeTimeButtonText}>🗑️</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  
                  {validationErrors.time && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorIcon}>⚠️</Text>
                      <Text style={styles.errorText}>{validationErrors.time}</Text>
                    </View>
                  )}
                </View>

                {/* Enhanced Frequency Selection */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>📅 التكرار</Text>
                  <View style={styles.frequencyContainer}>
                    <TouchableOpacity
                      style={styles.frequencyButtonContainer}
                      onPress={() => setNewMedicine({...newMedicine, frequency: 'daily'})}
                    >
                      <LinearGradient
                        colors={newMedicine.frequency === 'daily' ? ['#667EEA', '#764BA2'] as [string, string] : ['#F9FAFB', '#F3F4F6'] as [string, string]}
                        style={styles.frequencyButton}
                      >
                        <Text style={styles.frequencyButtonIcon}>📅</Text>
                        <Text style={[
                          styles.frequencyButtonText,
                          newMedicine.frequency === 'daily' && styles.frequencyButtonTextActive
                        ]}>
                          يومياً
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.frequencyButtonContainer}
                      onPress={() => setNewMedicine({...newMedicine, frequency: 'weekly'})}
                    >
                      <LinearGradient
                        colors={newMedicine.frequency === 'weekly' ? ['#667EEA', '#764BA2'] as [string, string] : ['#F9FAFB', '#F3F4F6'] as [string, string]}
                        style={styles.frequencyButton}
                      >
                        <Text style={styles.frequencyButtonIcon}>📆</Text>
                        <Text style={[
                          styles.frequencyButtonText,
                          newMedicine.frequency === 'weekly' && styles.frequencyButtonTextActive
                        ]}>
                          أسبوعياً
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Enhanced Weekly Days Selection */}
                {newMedicine.frequency === 'weekly' && (
                  <View style={[styles.inputContainer, styles.weeklyDaysContainer]}>
                    <Text style={styles.inputLabel}>📅 أيام الأسبوع</Text>
                    <View style={styles.weeklyDaysGrid}>
                      {DAYS_OF_WEEK.map((day, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dayButtonContainer}
                          onPress={() => toggleWeeklyDay(index)}
                        >
                          <LinearGradient
                            colors={newMedicine.weeklyDays.includes(index) 
                              ? ['#10B981', '#059669'] as [string, string]
                              : ['#F9FAFB', '#F3F4F6'] as [string, string]
                            }
                            style={styles.dayButton}
                          >
                            <Text style={[
                              styles.dayButtonText,
                              newMedicine.weeklyDays.includes(index) && styles.dayButtonTextActive
                            ]}>
                              {day}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Enhanced Stock Management */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>📦 إدارة المخزون (اختياري)</Text>
                  <View style={styles.stockContainer}>
                    <View style={styles.stockInputContainer}>
                      <Text style={styles.stockInputLabel}>العدد الحالي</Text>
                      <View style={styles.stockInputWrapper}>
                        <TextInput
                          style={[styles.stockInput, validationErrors.stock && styles.errorInput]}
                          placeholder="30"
                          placeholderTextColor="#9CA3AF"
                          value={newMedicine.stock}
                          onChangeText={handleStockChange}
                          keyboardType="numeric"
                          textAlign="center"
                        />
                      </View>
                    </View>
                    
                    <View style={styles.stockInputContainer}>
                      <Text style={styles.stockInputLabel}>تنبيه عند</Text>
                      <View style={styles.stockInputWrapper}>
                        <TextInput
                          style={styles.stockInput}
                          placeholder="5"
                          placeholderTextColor="#9CA3AF"
                          value={newMedicine.stockAlert}
                          onChangeText={(text) => setNewMedicine({...newMedicine, stockAlert: text})}
                          keyboardType="numeric"
                          textAlign="center"
                        />
                      </View>
                    </View>
                  </View>
                  {validationErrors.stock && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorIcon}>⚠️</Text>
                      <Text style={styles.errorText}>{validationErrors.stock}</Text>
                    </View>
                  )}
                </View>

                {/* Enhanced Submit Button */}
                <TouchableOpacity
                  onPress={addMedicine}
                  style={styles.submitButtonContainer}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669'] as [string, string]}
                    style={styles.submitButton}
                  >
                    <Text style={styles.submitButtonIcon}>✅</Text>
                    <Text style={styles.submitButtonText}>إضافة الدواء</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </LinearGradient>
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

        {/* Enhanced Medicine List */}
        <View style={styles.medicinesList}>
          {filteredMedicines.length === 0 ? (
            <RNAnimated.View style={[styles.emptyState, { opacity: fadeAnimation }]}>
              <LinearGradient
                colors={['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.05)'] as [string, string]}
                style={styles.emptyStateContainer}
              >
                <View style={styles.emptyStateIconContainer}>
                  <LinearGradient
                    colors={['#F3F4F6', '#E5E7EB'] as [string, string]}
                    style={styles.emptyStateIconBg}
                  >
                    <Text style={styles.emptyStateIcon}>
                      {selectedCategory === 'all' ? '📋' : MEDICINE_CATEGORIES[selectedCategory as MedicineCategory]?.icon || '📋'}
                    </Text>
                  </LinearGradient>
                </View>
                <Text style={styles.emptyStateTitle}>
                  {selectedCategory === 'all' 
                    ? 'لا توجد أدوية مضافة' 
                    : `لا توجد أدوية في فئة ${MEDICINE_CATEGORIES[selectedCategory as MedicineCategory]?.name || 'هذه الفئة'}`
                  }
                </Text>
                <Text style={styles.emptyStateText}>
                  {selectedCategory === 'all'
                    ? 'ابدأ رحلتك الصحية بإضافة أول دواء واحصل على تذكيرات ذكية ومواعيد دقيقة'
                    : 'يمكنك إضافة أدوية جديدة أو تغيير المرشح لعرض أدوية أخرى'
                  }
                </Text>
                <View style={styles.emptyStateFeatures}>
                  <Text style={styles.emptyStateFeature}>✨ تذكيرات صوتية</Text>
                  <Text style={styles.emptyStateFeature}>📊 إحصائيات مفصلة</Text>
                  <Text style={styles.emptyStateFeature}>📦 تتبع المخزون</Text>
                </View>
              </LinearGradient>
            </RNAnimated.View>
          ) : (
            filteredMedicines.map((medicine, index) => {
              const colors = getMedicineColors(medicine.category);
              const priorityConfig = PRIORITY_CONFIG[medicine.priority];
              return (
                <RNAnimated.View
                  key={medicine.id}
                  style={[
                    styles.medicineCard,
                    !medicine.isActive && styles.inactiveMedicineCard,
                    {
                      opacity: cardAnimations[index] || fadeAnimation,
                      transform: [{
                        translateY: (cardAnimations[index] || fadeAnimation).interpolate({
                          inputRange: [0, 1],
                          outputRange: [50, 0]
                        })
                      }]
                    }
                  ]}
                >
                  <LinearGradient
                    colors={medicine.isActive 
                      ? ['rgba(255, 255, 255, 1)', 'rgba(248, 250, 252, 0.8)'] as [string, string]
                      : ['rgba(243, 244, 246, 0.8)', 'rgba(229, 231, 235, 0.6)'] as [string, string]
                    }
                    style={styles.medicineCardGradient}
                  >
                    {/* Enhanced Medicine Header */}
                    <View style={styles.medicineHeader}>
                      <View style={styles.medicineInfo}>
                        <View style={styles.medicineNameContainer}>
                          <LinearGradient
                            colors={colors}
                            style={styles.colorIndicator}
                          >
                            <Text style={styles.categoryIconInCard}>{medicine.icon}</Text>
                          </LinearGradient>
                          <View style={styles.medicineNameWrapper}>
                            <Text style={styles.medicineName}>{medicine.name}</Text>
                            <View style={styles.medicineMetaInfo}>
                              <LinearGradient
                                colors={[priorityConfig.color + '20', priorityConfig.color + '10'] as [string, string]}
                                style={styles.priorityBadge}
                              >
                                <Text style={styles.priorityBadgeIcon}>{priorityConfig.icon}</Text>
                                <Text style={[styles.priorityBadgeText, { color: priorityConfig.color }]}>
                                  {priorityConfig.name}
                                </Text>
                              </LinearGradient>
                              <LinearGradient
                                colors={[MEDICINE_CATEGORIES[medicine.category].color[0] + '20', MEDICINE_CATEGORIES[medicine.category].color[0] + '10'] as [string, string]}
                                style={styles.categoryBadge}
                              >
                                <Text style={styles.categoryBadgeText}>
                                  {MEDICINE_CATEGORIES[medicine.category].name.split(' ')[0]}
                                </Text>
                              </LinearGradient>
                            </View>
                          </View>
                          {medicine.stock !== undefined && medicine.stockAlert !== undefined && 
                           medicine.stock <= medicine.stockAlert && (
                            <LinearGradient
                              colors={['#FEF2F2', '#FEE2E2'] as [string, string]}
                              style={styles.lowStockBadge}
                            >
                              <Text style={styles.lowStockBadgeText}>⚠️</Text>
                            </LinearGradient>
                          )}
                        </View>
                        <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                        {medicine.notes && (
                          <Text style={styles.medicineNotes}>📝 {medicine.notes}</Text>
                        )}
                      </View>
                      
                      <View style={styles.medicineActions}>
                        <TouchableOpacity
                          onPress={() => toggleMedicine(medicine.id)}
                          style={styles.actionButtonContainer}
                        >
                          <LinearGradient
                            colors={medicine.isActive ? ['#10B981', '#059669'] as [string, string] : ['#F3F4F6', '#E5E7EB'] as [string, string]}
                            style={styles.actionButton}
                          >
                            <Text style={styles.actionButtonText}>
                              {medicine.isActive ? '🔔' : '🔕'}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={() => deleteMedicine(medicine.id)}
                          style={styles.actionButtonContainer}
                        >
                          <LinearGradient
                            colors={['#FEF2F2', '#FEE2E2'] as [string, string]}
                            style={styles.actionButton}
                          >
                            <Text style={styles.actionButtonText}>🗑️</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Enhanced Medicine Details */}
                    <View style={styles.medicineDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>🕐 الأوقات:</Text>
                        <View style={styles.timesContainer}>
                          {medicine.times.map((time, timeIndex) => (
                            <LinearGradient
                              key={timeIndex}
                              colors={['#EFF6FF', '#DBEAFE'] as [string, string]}
                              style={styles.timeChip}
                            >
                              <Text style={styles.timeChipText}>{formatTime(time)}</Text>
                            </LinearGradient>
                          ))}
                        </View>
                      </View>
                      
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>📅 التكرار:</Text>
                        <View style={styles.frequencyDisplay}>
                          <LinearGradient
                            colors={['#ECFDF5', '#D1FAE5'] as [string, string]}
                            style={styles.frequencyChip}
                          >
                            <Text style={styles.frequencyChipText}>
                              {medicine.frequency === 'daily' ? 'يومياً' : 'أسبوعياً'}
                            </Text>
                          </LinearGradient>
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
                            <LinearGradient
                              colors={medicine.stockAlert && medicine.stock <= medicine.stockAlert 
                                ? ['#FEF2F2', '#FEE2E2'] as [string, string]
                                : ['#F3F4F6', '#E5E7EB'] as [string, string]
                              }
                              style={styles.stockChip}
                            >
                           <Text style={[
                              styles.stockChipText,
                              (medicine.stockAlert !== undefined && medicine.stock <= medicine.stockAlert) ? styles.lowStockChipText : undefined
                              ]}>
                              {medicine.stock} متبقي
                          </Text>

                            </LinearGradient>
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
                          <LinearGradient
                            colors={['#FFFBEB', '#FEF3C7'] as [string, string]}
                            style={styles.nextDoseChip}
                          >
                            <Text style={styles.nextDoseText}>
                              {getTimeUntilNext(medicine)}
                            </Text>
                          </LinearGradient>
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

                    {/* Enhanced Take Medicine Button */}
                    {medicine.isActive && (
                      <TouchableOpacity
                        onPress={() => markAsTaken(medicine.id)}
                        style={styles.takenButtonContainer}
                      >
                        <LinearGradient
                          colors={colors}
                          style={styles.takenButton}
                        >
                          <Text style={styles.takenButtonIcon}>✅</Text>
                          <Text style={styles.takenButtonText}>تم تناول الدواء</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </LinearGradient>
                </RNAnimated.View>
              );
            })
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
  },
  loadingContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 40,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingIcon: {
    fontSize: 48,
  },
  loadingText: {
    fontSize: 18,
    color: '#64748B',
    fontFamily: 'System',
    fontWeight: '600',
    marginBottom: 16,
  },
  loadingBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadingProgress: {
    height: '100%',
    backgroundColor: '#667EEA',
    borderRadius: 2,
  },
  headerGradient: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  header: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    position: 'relative',
  },
  floatingDecor: {
    position: 'absolute',
    zIndex: 1,
  },
  floatingDecor1: {
    top: 20,
    right: 30,
  },
  floatingDecor2: {
    top: 40,
    left: 30,
  },
  decorEmoji: {
    fontSize: 24,
    opacity: 0.7,
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  headerTitleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
    fontFamily: 'System',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    fontFamily: 'System',
    fontWeight: '500',
  },
  statsContainer: {
    width: '100%',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  statCard: {
    minWidth: 80,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  statCardGradient: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
    fontFamily: 'System',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'System',
    fontWeight: '600',
    textAlign: 'center',
  },
  statIcon: {
    fontSize: 16,
    marginTop: 4,
  },
  statusIndicatorContainer: {
    width: '100%',
  },
  statusIndicator: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10F981',
    marginBottom: 8,
    shadowColor: '#10F981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    fontFamily: 'System',
    marginBottom: 4,
  },
  statusSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'System',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
  },
  filterBar: {
    marginVertical: 16,
  },
  categoryScrollView: {
    maxHeight: 60,
  },
  categoryScrollContainer: {
    paddingHorizontal: 4,
    gap: 12,
  },
  categoryFilterContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    minWidth: 120,
  },
  categoryFilterIcon: {
    fontSize: 18,
  },
  categoryFilterText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
    flexShrink: 1,
  },
  categoryFilterTextActive: {
    color: 'white',
  },
  sortContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sortLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'right',
    fontFamily: 'System',
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sortButtonContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  sortButtonIcon: {
    fontSize: 14,
  },
  sortButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
  },
  sortButtonTextActive: {
    color: 'white',
  },
  addButtonContainer: {
    marginVertical: 24,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  addButton: {
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  addButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  addButtonIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonIcon: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  addButtonTextContainer: {
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'System',
    marginBottom: 2,
  },
  addButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: 'System',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  modalTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
    fontFamily: 'System',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'System',
    fontWeight: '500',
  },
  closeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButtonGradient: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  inputContainer: {
    marginBottom: 28,
  },
  inputLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'right',
    fontFamily: 'System',
  },
  inputWrapper: {
    position: 'relative',
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: 'white',
    minHeight: 56,
    fontFamily: 'System',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorInput: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontFamily: 'System',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryOptionContainer: {
    width: (width - 72) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  categoryOption: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
    minHeight: 80,
  },
  categoryOptionIcon: {
    fontSize: 24,
  },
  categoryOptionText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
    lineHeight: 18,
  },
  categoryOptionTextActive: {
    color: 'white',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityOptionContainer: {
    flex: 1,
    minWidth: (width - 80) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  priorityOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  priorityOptionIcon: {
    fontSize: 20,
  },
  priorityOptionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
  },
  priorityOptionTextActive: {
    color: 'white',
  },
  timesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addTimeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addTimeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  addTimeButtonIcon: {
    fontSize: 14,
    color: 'white',
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  timeButtonGradient: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    justifyContent: 'center',
  },
  timeButtonContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
    color: '#374151',
    fontFamily: 'System',
    fontWeight: '600',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  timeIcon: {
    fontSize: 20,
  },
  removeTimeButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  removeTimeButtonGradient: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeTimeButtonText: {
    fontSize: 18,
  },
  frequencyContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  frequencyButtonContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  frequencyButton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  frequencyButtonIcon: {
    fontSize: 24,
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
    backgroundColor: 'rgba(102, 126, 234, 0.05)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  weeklyDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  dayButtonContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dayButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
  },
  dayButtonTextActive: {
    color: 'white',
  },
  stockContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  stockInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  stockInputLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    fontFamily: 'System',
    fontWeight: '600',
  },
  stockInputWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
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
    fontWeight: '600',
  },
  submitButtonContainer: {
    marginTop: 32,
    marginBottom: 50,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  submitButtonIcon: {
    fontSize: 20,
    color: 'white',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'System',
  },
  medicinesList: {
    paddingBottom: 30,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateContainer: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  emptyStateIconContainer: {
    marginBottom: 24,
  },
  emptyStateIconBg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 64,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'System',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'System',
    marginBottom: 24,
    maxWidth: 320,
  },
  emptyStateFeatures: {
    alignItems: 'center',
    gap: 8,
  },
  emptyStateFeature: {
    fontSize: 14,
    color: '#667EEA',
    fontFamily: 'System',
    fontWeight: '600',
  },
  medicineCard: {
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  inactiveMedicineCard: {
    opacity: 0.7,
  },
  medicineCardGradient: {
    padding: 24,
  },
  medicineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  medicineInfo: {
    flex: 1,
    marginRight: 16,
  },
  medicineNameContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  colorIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryIconInCard: {
    fontSize: 24,
    color: 'white',
  },
  medicineNameWrapper: {
    flex: 1,
  },
  medicineName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    fontFamily: 'System',
    marginBottom: 8,
  },
  medicineMetaInfo: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  priorityBadgeIcon: {
    fontSize: 12,
  },
  priorityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'System',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'System',
  },
  lowStockBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  lowStockBadgeText: {
    fontSize: 14,
  },
  medicineDosage: {
    fontSize: 16,
    color: '#6B7280',
    fontFamily: 'System',
    fontWeight: '500',
    lineHeight: 22,
    marginBottom: 8,
  },
  medicineNotes: {
    fontSize: 14,
    color: '#8B5CF6',
    fontFamily: 'System',
    fontWeight: '500',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  medicineActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
  },
  medicineDetails: {
    marginBottom: 24,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    fontFamily: 'System',
    minWidth: 80,
  },
  timesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  timeChip: {
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  frequencyChip: {
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  stockChip: {
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
  lowStockChipText: {
    color: '#DC2626',
  },
  stockAlertText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'System',
  },
  nextDoseLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    fontFamily: 'System',
  },
  nextDoseChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flex: 1,
    alignItems: 'flex-end',
  },
  nextDoseText: {
    fontSize: 14,
    color: '#D97706',
    fontWeight: '600',
    fontFamily: 'System',
  },
  lastTakenLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    fontFamily: 'System',
  },
  lastTakenValue: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'System',
    flex: 1,
    textAlign: 'right',
  },
  takenButtonContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  takenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  takenButtonIcon: {
    fontSize: 18,
    color: 'white',
  },
  takenButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
  },
  alarmContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  alarmBackgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  patternDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
  },
  alarmContent: {
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    zIndex: 1,
  },
  alarmIconContainer: {
    marginBottom: 32,
  },
  alarmIconOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  alarmIconInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  alarmIconText: {
    fontSize: 56,
    zIndex: 2,
  },
  alarmIconRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  alarmTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'System',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  alarmSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 32,
    textAlign: 'center',
    fontFamily: 'System',
    fontWeight: '600',
  },
  alarmDetails: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  medicineNameCard: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 20,
  },
  alarmMedicineName: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    fontFamily: 'System',
    textAlign: 'center',
  },
  alarmInfoGrid: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  alarmInfoItem: {
    alignItems: 'center',
    flex: 1,
  },
  alarmInfoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  alarmDosage: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
  },
  alarmTime: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
  },
  snoozeCountContainer: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  snoozeCount: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
  },
  alarmButtons: {
    width: '100%',
    gap: 16,
  },
  takenAlarmButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  alarmButtonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takenAlarmButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'System',
  },
  alarmSecondaryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  snoozeAlarmButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  snoozeAlarmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
  },
  stopAlarmButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  stopAlarmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
  },
  primaryStatCard: {
    shadowColor: '#10B981',
  },
  secondaryStatCard: {
    shadowColor: '#3B82F6',
  },
  successStatCard: {
    shadowColor: '#059669',
  },
  criticalStatCard: {
    shadowColor: '#DC2626',
  },
  warningStatCard: {
    shadowColor: '#F59E0B',
  },
});

export default MedicineReminderApp;