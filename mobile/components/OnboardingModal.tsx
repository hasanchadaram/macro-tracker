import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Profile } from '@/lib/types';
import { TipsModal } from '@/components/TipsModal';
import { useAlert } from '@/components/ui/CustomAlert';
import { ProteinSlider } from '@/components/ProteinSlider';
import {
  calculateNutritionTargets,
  getDefaultProteinMultiplier,
  getProteinBaselineInfo,
  formatWeight,
  type ProteinBaselineInfo,
  type GoalType,
} from '@/lib/nutrition';

interface OnboardingModalProps {
  visible: boolean;
  onSave: (profileData: Partial<Profile>) => Promise<void>;
  onSkip: () => void;
  initialStep?: Step;
  initialProfile?: Profile | null;
}

type Step = 'intro' | 'age-gender' | 'height-weight' | 'goal' | 'target-weight' | 'review';

export function OnboardingModal({ visible, onSave, onSkip, initialStep, initialProfile }: OnboardingModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const [step, setStep] = useState<Step>('intro');
  const [isSaving, setIsSaving] = useState(false);
  const [tipsVisible, setTipsVisible] = useState(false);

  // Form State
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | null>(null);
  const [height, setHeight] = useState(''); // cm
  const [weight, setWeight] = useState(''); // kg
  const [goal, setGoal] = useState<GoalType | null>(null);
  const [targetWeight, setTargetWeight] = useState(''); // kg

  // Calculated Targets State
  const [targetCalories, setTargetCalories] = useState('');
  const [maintenanceCalories, setMaintenanceCalories] = useState('');
  const [underEatingThreshold, setUnderEatingThreshold] = useState('');
  const [targetSteps, setTargetSteps] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetCarbs, setTargetCarbs] = useState('');
  const [targetFat, setTargetFat] = useState('');

  // Protein Slider & Baseline State
  const [proteinMultiplier, setProteinMultiplier] = useState<number>(2.0);
  const [weightBaseline, setWeightBaseline] = useState<number>(0);
  const [baselineInfo, setBaselineInfo] = useState<ProteinBaselineInfo | undefined>(undefined);

  React.useEffect(() => {
    if (visible) {
      setStep(initialStep || 'intro');
      if (initialProfile) {
        setAge(initialProfile.age?.toString() || '');
        setGender((initialProfile.gender as any) || null);
        // Determine the weight baseline used for protein target calibration:
        // When in 'review' step, prioritize calibrated_weight_kg (the calibrated baseline weight when targets were set)
        // rather than volatile daily scale weight logs
        const effectiveWeight = (initialStep === 'review' && initialProfile.calibrated_weight_kg)
          ? initialProfile.calibrated_weight_kg
          : (initialProfile.weight_kg || 70);

        setWeight(effectiveWeight.toString());
        const rawGoal = (initialProfile.goal as any) || null;
        setGoal(rawGoal === 'Gain weight' || rawGoal === 'Gain Muscle' ? 'Gain muscle' : rawGoal);
        setTargetWeight(initialProfile.target_weight_kg?.toString() || '');
        
        setTargetCalories(initialProfile.target_calories?.toString() || '');
        setTargetProtein(initialProfile.target_protein?.toString() || '');
        setTargetCarbs(initialProfile.target_carbs?.toString() || '');
        setTargetFat(initialProfile.target_fat?.toString() || '');
        setTargetSteps(initialProfile.target_steps?.toString() || '');
        setMaintenanceCalories(initialProfile.maintenance_calories?.toString() || '');
        setUnderEatingThreshold(initialProfile.under_eating_threshold?.toString() || '');

        const tw = initialProfile.target_weight_kg;
        const g = (initialProfile.goal as any) || null;
        const bInfo = getProteinBaselineInfo(effectiveWeight, tw, g);
        setBaselineInfo(bInfo);
        setWeightBaseline(bInfo.baseline);

        if (initialProfile.protein_multiplier) {
          setProteinMultiplier(initialProfile.protein_multiplier);
        } else if (initialProfile.target_protein && bInfo.baseline > 0) {
          const derivedMult = initialProfile.target_protein / bInfo.baseline;
          setProteinMultiplier(Math.min(2.2, Math.max(1.6, Math.round(derivedMult * 10) / 10)));
        } else {
          setProteinMultiplier(getDefaultProteinMultiplier(g));
        }
      } else if (initialStep !== 'review') {
        setAge(''); setGender(null); setHeight(''); setWeight('');
        setGoal(null); setTargetWeight(''); setTargetCalories('');
        setTargetProtein(''); setTargetCarbs(''); setTargetFat('');
        setTargetSteps(''); setMaintenanceCalories(''); setUnderEatingThreshold('');
        setProteinMultiplier(2.0); setWeightBaseline(0); setBaselineInfo(undefined);
      }
    }
  }, [visible, initialStep, initialProfile]);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const buttonBg = isDark ? '#334155' : '#F1F5F9';

  const handleNext = () => {
    if (step === 'intro') setStep('age-gender');
    else if (step === 'age-gender') setStep('height-weight');
    else if (step === 'height-weight') setStep('goal');
    else if (step === 'goal') {
      if (goal === 'Lose weight' || goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') {
        setStep('target-weight');
      } else {
        calculateTargets();
        setStep('review');
      }
    } else if (step === 'target-weight') {
      calculateTargets();
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'age-gender') setStep('intro');
    else if (step === 'height-weight') setStep('age-gender');
    else if (step === 'goal') setStep('height-weight');
    else if (step === 'target-weight') setStep('goal');
    else if (step === 'review') {
      if (goal === 'Lose weight' || goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') setStep('target-weight');
      else setStep('goal');
    }
  };

  const calculateTargets = () => {
    const a = parseInt(age) || 25;
    const h = parseFloat(height) || 170;
    const w = parseFloat(weight) || 70;
    const tw = targetWeight ? parseFloat(targetWeight) : null;

    const result = calculateNutritionTargets({
      age: a,
      gender,
      heightCm: h,
      weightKg: w,
      goal,
      targetWeightKg: tw,
    });

    setMaintenanceCalories(result.tdee.toString());
    setUnderEatingThreshold(result.bmr.toString());
    setTargetSteps(result.targetSteps.toString());
    setTargetCalories(result.targetCalories.toString());
    setTargetProtein(result.targetProtein.toString());
    setTargetFat(result.targetFat.toString());
    setTargetCarbs(result.targetCarbs.toString());
    setProteinMultiplier(result.proteinMultiplier);
    setWeightBaseline(result.weightBaseline);
    setBaselineInfo(result.baselineInfo);
  };

  const handleCaloriesChange = (text: string) => {
    setTargetCalories(text);
    const newCals = parseFloat(text);

    if (!isNaN(newCals) && newCals > 0) {
      // Priority 1: Protein set first based on calibrated weight baseline & multiplier (4 cal/g)
      const baseline = weightBaseline > 0 ? weightBaseline : (parseFloat(weight) || 70);
      const mult = proteinMultiplier || getDefaultProteinMultiplier(goal);
      const pTarget = Math.round(mult * baseline);
      const pCals = pTarget * 4;

      // Priority 2: Healthy fat range (20% to 30% of total calories, targeting 45% of non-protein calories at 8 cal/g)
      const remainingCals = Math.max(0, newCals - pCals);
      const rawFatCals = remainingCals * 0.45;
      const maxFatCals = newCals * 0.30;
      const minFatCals = newCals * 0.20;
      const fatCals = Math.max(minFatCals, Math.min(rawFatCals, maxFatCals));
      const fTarget = Math.round(fatCals / 8);
      const actualFatCals = fTarget * 8;

      // Priority 3: Carbs receives the remaining calories (4 cal/g)
      const carbCals = Math.max(0, newCals - pCals - actualFatCals);
      const cTarget = Math.round(carbCals / 4);

      setTargetProtein(pTarget.toString());
      setTargetCarbs(cTarget.toString());
      setTargetFat(fTarget.toString());
    }
  };

  const handleProteinSliderChange = (newMult: number) => {
    setProteinMultiplier(newMult);
    const baseline = weightBaseline > 0 ? weightBaseline : (parseFloat(weight) || 70);
    const newProtGrams = Math.round(newMult * baseline);
    
    // Shift calories to/from carbs (4 kcal/g for both, fat is 8 kcal/g)
    const cals = parseFloat(targetCalories) || 0;
    const fat = parseFloat(targetFat) || 0;
    if (cals > 0) {
      const remainingForCarbs = Math.max(0, cals - (newProtGrams * 4) - (fat * 8));
      setTargetCarbs(Math.round(remainingForCarbs / 4).toString());
    }
    setTargetProtein(newProtGrams.toString());
  };

  const handleProteinChange = (text: string) => {
    setTargetProtein(text);
    const prot = parseFloat(text);
    if (!isNaN(prot)) {
      // 1g protein = 4 kcal, shift difference to carbs so total calories remain identical
      const cals = parseFloat(targetCalories) || 0;
      const fat = parseFloat(targetFat) || 0;
      if (cals > 0) {
        const remainingForCarbs = Math.max(0, cals - (prot * 4) - (fat * 8));
        setTargetCarbs(Math.round(remainingForCarbs / 4).toString());
      }
      if (weightBaseline > 0) {
        const derivedMult = prot / weightBaseline;
        if (derivedMult >= 1.6 && derivedMult <= 2.2) {
          setProteinMultiplier(Math.round(derivedMult * 10) / 10);
        }
      }
    }
  };

  const handleCarbsChange = (text: string) => {
    setTargetCarbs(text);
    const newCarbs = parseFloat(text);
    if (!isNaN(newCarbs)) {
      const cals = parseFloat(targetCalories) || 0;
      const prot = parseFloat(targetProtein) || 0;
      if (cals > 0) {
        // Shift difference directly to/from fat (8 cal/g), keeping total calories and protein fixed
        const remainingForFat = Math.max(0, cals - (prot * 4) - (newCarbs * 4));
        setTargetFat(Math.round(remainingForFat / 8).toString());
      }
    }
  };

  const handleFatChange = (text: string) => {
    setTargetFat(text);
    const newFat = parseFloat(text);
    if (!isNaN(newFat)) {
      const cals = parseFloat(targetCalories) || 0;
      const prot = parseFloat(targetProtein) || 0;
      if (cals > 0) {
        // Shift 100% of fat calories (8 cal/g) directly to/from carbs (4 cal/g), keeping total calories fixed
        const remainingForCarbs = Math.max(0, cals - (prot * 4) - (newFat * 8));
        setTargetCarbs(Math.round(remainingForCarbs / 4).toString());
      }
    }
  };

  const performSave = async (forceUnderEatingThreshold?: number) => {
    setIsSaving(true);
    await onSave({
      age: parseInt(age) || null,
      gender,
      height_cm: parseFloat(height) || null,
      weight_kg: parseFloat(weight) || null,
      goal,
      target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
      activity_level: 'Sedentary',
      maintenance_calories: parseFloat(maintenanceCalories) || null,
      under_eating_threshold: forceUnderEatingThreshold || parseFloat(underEatingThreshold) || null,
      target_steps: parseInt(targetSteps) || null,
      target_calories: parseFloat(targetCalories) || 2000,
      target_protein: parseFloat(targetProtein) || 150,
      target_carbs: parseFloat(targetCarbs) || 200,
      target_fat: parseFloat(targetFat) || 65,
      protein_multiplier: proteinMultiplier,
      calibrated_weight_kg: weightBaseline > 0 ? weightBaseline : (parseFloat(weight) || null),
    });
    setIsSaving(false);
  };

  const submitProfile = () => {
    const cals = parseFloat(targetCalories);
    const bmrValue = parseFloat(underEatingThreshold);
    const prot = parseFloat(targetProtein);
    const w = parseFloat(weight);

    const showWarning = (title: string, message: string, proceedAction: () => void) => {
      showAlert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', onPress: proceedAction }
      ]);
    };

    if (!isNaN(cals)) {
      const minCalories = gender === 'Male' ? 1500 : 1200;
      const genderLabel = gender === 'Male' ? 'men' : 'women';

      // 1. Check if below personalized BMR
      if (!isNaN(bmrValue) && cals < bmrValue) {
        showWarning(
          'Calories Below BMR',
          `Target calories (${cals} kcal) are lower than your Basal Metabolic Rate (${Math.round(bmrValue)} kcal). Eating below your BMR can cause muscle loss and metabolic slowdown. Are you sure?`,
          () => performSave(cals)
        );
        return;
      }

      // 2. Check if below population safety threshold (only if BMR is above the threshold)
      const effectiveFloor = !isNaN(bmrValue) ? Math.min(minCalories, bmrValue) : minCalories;
      if (cals < effectiveFloor) {
        showWarning(
          'Calories Very Low',
          `Target calories below ${effectiveFloor} kcal for ${genderLabel} can cause fatigue, hormonal disruption, and muscle loss. Are you sure you want to proceed?`,
          () => performSave(cals)
        );
        return;
      }
        if (cals > bmrValue * 1.9) {
          showWarning(
            'Calories Too High',
            'Target calories exceed the safe limit. Are you sure?',
            () => performSave()
          );
          return;
        }
      }

    if (!isNaN(prot) && !isNaN(w)) {
      if (prot < w * 0.8) {
        showWarning(
          'Protein Too Low',
          'Protein intake is below the recommended 0.8g per kg of body weight for basic health maintenance. Are you sure?',
          () => performSave()
        );
        return;
      }
      if (prot > w * 2.4) {
        showWarning(
          'Protein Too High',
          'Protein intake exceeds the recommended 2.4g per kg of body weight. Are you sure?',
          () => performSave()
        );
        return;
      }
    }

    performSave();
  };

  const canProceed = () => {
    if (step === 'age-gender') return age && gender;
    if (step === 'height-weight') return height && weight;

    if (step === 'goal') return goal;
    if (step === 'target-weight') {
      const current = parseFloat(weight);
      const target = parseFloat(targetWeight);
      if (!targetWeight || isNaN(target)) return false;
      if (goal === 'Lose weight' && target >= current) return false;
      if ((goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') && target <= current) return false;
      if (Math.abs(current - target) > 12) return false;
      return true;
    }
    return true;
  };

  const getStepNumber = () => {
    switch (step) {
      case 'intro': return 1;
      case 'age-gender': return 2;
      case 'height-weight': return 3;
      case 'goal': return 4;
      case 'target-weight': return 5;
      case 'review': return 6;
      default: return 1;
    }
  };

  const stepNumber = getStepNumber();
  const totalSteps = goal === 'Lose weight' || goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight' ? 6 : 5;
  const progressPercent = (stepNumber / totalSteps) * 100;

  const bmrInfoText = () => {
    if (goal === 'Just track my food') return null;

    let targetDiff = 0;
    if (goal === 'Lose weight') targetDiff = parseFloat(maintenanceCalories) - parseFloat(targetCalories);
    else if (goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') targetDiff = parseFloat(targetCalories) - parseFloat(maintenanceCalories);
    
    // approx 7700 kcal per kg of body fat. So weekly diff = targetDiff * 7
    // weekly weight change = (targetDiff * 7) / 7700 = targetDiff / 1100
    const weeklyChange = (targetDiff / 1100).toFixed(2);
    const actionStr = goal === 'Lose weight' ? 'lose' : ((goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') ? 'gain' : 'maintain');

    let weeksToGoalText = '';
    if ((goal === 'Lose weight' || goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') && parseFloat(weeklyChange) > 0 && targetWeight && weight) {
      const weightDiff = Math.abs(parseFloat(weight) - parseFloat(targetWeight));
      const weeksToGoal = Math.ceil(weightDiff / parseFloat(weeklyChange));
      weeksToGoalText = ` It will take approximately ${weeksToGoal} weeks to reach your target weight.`;
    }

    return (
      <View style={[styles.infoBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
        <Ionicons name="information-circle" size={24} color="#3B82F6" style={{ marginTop: 2 }} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.infoTitle, { color: textPrimary }]}>BMR Estimate</Text>
          <Text style={[styles.infoText, { color: textSecondary }]}>
            Everyone's Basal Metabolic Rate (BMR) varies. Based on these calculated targets, we estimate you will {actionStr} <Text style={{ fontWeight: '600', color: textPrimary }}>~{weeklyChange} kg</Text> per week.{weeksToGoalText}
          </Text>
          <Text style={[styles.infoText, { color: textSecondary, marginTop: 8 }]}>
            We will adjust your calorie targets as you progress toward your accurate BMR. Please note that BMR can be affected negatively by poor health and under-eating, and positively by gaining muscle mass.
          </Text>
        </View>
      </View>
    );
  };

  const renderIntro = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.emoji, { fontSize: 48, textAlign: 'center' }]}>🎯</Text>
      <Text style={[styles.title, { color: textPrimary, textAlign: 'center', marginTop: 16 }]}>
        Set Your Nutrition Goals
      </Text>
      <Text style={[styles.subtitle, { color: textSecondary, textAlign: 'center', marginTop: 12 }]}>
        Let's calculate your personalized calorie and macro targets based on your body and goals.
      </Text>
      
      <View style={{ marginTop: 40, gap: 12 }}>
        <Pressable style={styles.primaryBtn} onPress={handleNext}>
          <Text style={styles.primaryBtnText}>Start Setup</Text>
        </Pressable>
        <Pressable 
          style={[styles.secondaryBtn, { borderColor }]} 
          onPress={onSkip}
        >
          <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderAgeGender = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: textPrimary }]}>Basic Info</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>We use this to calculate your metabolic rate.</Text>
      
      <Text style={[styles.label, { color: textPrimary, marginTop: 24 }]}>Age</Text>
      <TextInput
        style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
        keyboardType="numeric"
        placeholder="e.g. 28"
        placeholderTextColor={textSecondary}
        value={age}
        onChangeText={setAge}
      />

      <Text style={[styles.label, { color: textPrimary, marginTop: 24 }]}>Gender</Text>
      <View style={styles.rowGrid}>
        <Pressable
          style={[styles.choiceBtn, { backgroundColor: buttonBg, borderColor }, gender === 'Male' && styles.choiceActive]}
          onPress={() => setGender('Male')}
        >
          <Text style={[styles.choiceText, { color: textPrimary }, gender === 'Male' && styles.choiceActiveText]}>Male</Text>
        </Pressable>
        <Pressable
          style={[styles.choiceBtn, { backgroundColor: buttonBg, borderColor }, gender === 'Female' && styles.choiceActive]}
          onPress={() => setGender('Female')}
        >
          <Text style={[styles.choiceText, { color: textPrimary }, gender === 'Female' && styles.choiceActiveText]}>Female</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderHeightWeight = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: textPrimary }]}>Body Metrics</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>Just a few more details for the formula.</Text>
      
      <Text style={[styles.label, { color: textPrimary, marginTop: 24 }]}>Height (cm)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
        keyboardType="decimal-pad"
        placeholder="e.g. 175"
        placeholderTextColor={textSecondary}
        value={height}
        onChangeText={setHeight}
      />

      <Text style={[styles.label, { color: textPrimary, marginTop: 24 }]}>Current Weight (kg)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
        keyboardType="decimal-pad"
        placeholder="e.g. 70"
        placeholderTextColor={textSecondary}
        value={weight}
        onChangeText={setWeight}
      />
    </View>
  );

  const renderGoal = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: textPrimary }]}>What's your goal?</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>We'll adjust your calories accordingly.</Text>
      
      <View style={{ marginTop: 24, gap: 12 }}>
        {['Lose weight', 'Maintain weight', 'Gain muscle', 'Just track my food'].map((g) => (
          <Pressable
            key={g}
            style={[styles.choiceListBtn, { backgroundColor: buttonBg, borderColor }, goal === g && styles.choiceActive]}
            onPress={() => setGoal(g as any)}
          >
            <Text style={[styles.choiceText, { color: textPrimary }, goal === g && styles.choiceActiveText]}>{g}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderTargetWeight = () => {
    const currentW = parseFloat(weight);
    const targetW = parseFloat(targetWeight);
    const isTargetNum = !isNaN(targetW) && targetWeight !== '';
    const diff = isTargetNum ? Math.abs(currentW - targetW) : 0;
    const isDiffTooLarge = isTargetNum && diff > 12;

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.title, { color: textPrimary }]}>Target Weight</Text>
        <Text style={[styles.subtitle, { color: textSecondary }]}>
          Since your goal is to {goal?.toLowerCase()}, what is your target weight?
        </Text>
        
        <Text style={[styles.label, { color: textPrimary, marginTop: 24 }]}>Target Weight (kg)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
          keyboardType="decimal-pad"
          placeholder={`Current: ${weight} kg`}
          placeholderTextColor={textSecondary}
          value={targetWeight}
          onChangeText={setTargetWeight}
        />
        
        {targetWeight !== '' && goal === 'Lose weight' && targetW >= currentW && (
          <Text style={styles.errorText}>Target weight must be less than current weight ({weight} kg).</Text>
        )}
        {targetWeight !== '' && (goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') && targetW <= currentW && (
          <Text style={styles.errorText}>Target weight must be greater than current weight ({weight} kg).</Text>
        )}
        {isDiffTooLarge && (
          <View style={[styles.diffWarningBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', borderColor: '#F59E0B' }]}>
            <Ionicons name="information-circle" size={20} color="#D97706" style={{ marginTop: 2 }} />
            <Text style={[styles.diffWarningText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
              Target weight difference cannot exceed 12 kg (currently {formatWeight(diff)} kg). Take it step-by-step—go little by little! You can set a new target once you reach this milestone.
            </Text>
          </View>
        )}
        <Text style={[styles.tipSubtext, { color: textSecondary, marginTop: 8 }]}>
          Tip: Aim for a target within 12 kg of your current weight ({weight || 70} kg) for healthy, sustainable progress.
        </Text>
      </View>
    );
  };

  const renderReview = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: textPrimary }]}>Daily Targets</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>
        Here are your calculated daily targets. You can adjust your protein via the bar below or tap on any number to edit it.
      </Text>
      
      <View style={styles.reviewGrid}>
        <View style={[styles.reviewCard, { backgroundColor: inputBg, borderColor }]}>
          <TextInput
            style={[styles.reviewValue, { color: '#6366F1', textAlign: 'center', padding: 0, minWidth: 60 }]}
            keyboardType="numeric"
            value={targetCalories}
            onChangeText={handleCaloriesChange}
          />
          <Text style={[styles.reviewLabel, { color: textSecondary }]}>Calories</Text>
        </View>
        <View style={[styles.reviewCard, { backgroundColor: inputBg, borderColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <TextInput
              style={[styles.reviewValue, { color: '#F43F5E', textAlign: 'center', padding: 0, minWidth: 40 }]}
              keyboardType="numeric"
              value={targetProtein}
              onChangeText={handleProteinChange}
            />
            <Text style={[styles.reviewValue, { color: '#F43F5E', fontSize: 16 }]}>g</Text>
          </View>
          <Text style={[styles.reviewLabel, { color: textSecondary }]}>Protein</Text>
        </View>
        <View style={[styles.reviewCard, { backgroundColor: inputBg, borderColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <TextInput
              style={[styles.reviewValue, { color: '#60A5FA', textAlign: 'center', padding: 0, minWidth: 40 }]}
              keyboardType="numeric"
              value={targetCarbs}
              onChangeText={handleCarbsChange}
            />
            <Text style={[styles.reviewValue, { color: '#60A5FA', fontSize: 16 }]}>g</Text>
          </View>
          <Text style={[styles.reviewLabel, { color: textSecondary }]}>Carbs</Text>
        </View>
        <View style={[styles.reviewCard, { backgroundColor: inputBg, borderColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <TextInput
              style={[styles.reviewValue, { color: '#FBBF24', textAlign: 'center', padding: 0, minWidth: 40 }]}
              keyboardType="numeric"
              value={targetFat}
              onChangeText={handleFatChange}
            />
            <Text style={[styles.reviewValue, { color: '#FBBF24', fontSize: 16 }]}>g</Text>
          </View>
          <Text style={[styles.reviewLabel, { color: textSecondary }]}>Fat</Text>
        </View>
        <View style={[styles.reviewCard, { backgroundColor: inputBg, borderColor }]}>
          <TextInput
            style={[styles.reviewValue, { color: '#10B981', textAlign: 'center', padding: 0, minWidth: 60 }]}
            keyboardType="numeric"
            value={targetSteps}
            onChangeText={setTargetSteps}
          />
          <Text style={[styles.reviewLabel, { color: textSecondary }]}>Steps/Day</Text>
        </View>
      </View>

      {/* Protein Adjustment Slider Bar */}
      <ProteinSlider
        multiplier={proteinMultiplier}
        onMultiplierChange={handleProteinSliderChange}
        weightBaseline={weightBaseline > 0 ? weightBaseline : (parseFloat(weight) || 70)}
        baselineInfo={baselineInfo}
        recommendedMultiplier={getDefaultProteinMultiplier(goal)}
        isDark={isDark}
        totalGrams={parseFloat(targetProtein) || 0}
      />

      {bmrInfoText()}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {step !== 'intro' && (
                <Pressable onPress={handleBack} style={{ padding: 4, marginLeft: -4 }}>
                  <Ionicons name="arrow-back" size={24} color={textPrimary} />
                </Pressable>
              )}
              <Text style={[styles.title, { color: textPrimary }]}>
                Nutrition Goals
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {step === 'review' && (
                <Pressable onPress={() => setTipsVisible(true)} style={{ padding: 4 }}>
                  <Ionicons name="bulb-outline" size={24} color="#EAB308" />
                </Pressable>
              )}
              <Pressable onPress={onSkip} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Progress Bar */}
          {step !== 'intro' && (
            <View style={styles.progressContainer}>
              <Text style={[styles.progressText, { color: textSecondary }]}>Step {stepNumber} of {totalSteps}</Text>
              <View style={[styles.progressBarBg, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {step === 'intro' && renderIntro()}
            {step === 'age-gender' && renderAgeGender()}
            {step === 'height-weight' && renderHeightWeight()}
            {step === 'goal' && renderGoal()}
            {step === 'target-weight' && renderTargetWeight()}
            {step === 'review' && renderReview()}
          </ScrollView>

          {step !== 'intro' && (
            <View style={styles.footer}>
              {step !== 'review' ? (
                <Pressable
                  style={[styles.primaryBtn, !canProceed() && styles.btnDisabled]}
                  onPress={handleNext}
                  disabled={!canProceed()}
                >
                  <Text style={styles.primaryBtnText}>Next</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primaryBtn, isSaving && styles.btnDisabled]}
                  onPress={submitProfile}
                  disabled={isSaving}
                >
                  <Text style={styles.primaryBtnText}>{isSaving ? 'Saving...' : 'Save Targets'}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <TipsModal visible={tipsVisible} onClose={() => setTipsVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  stepContainer: {
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 22,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  rowGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  choiceListBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  choiceText: {
    fontSize: 16,
    fontWeight: '500',
  },
  choiceActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  choiceActiveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  reviewCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  reviewValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  reviewLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 8,
  },
  diffWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    gap: 8,
  },
  diffWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  tipSubtext: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  primaryBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
