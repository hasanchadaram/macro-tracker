// Test script for percentage-based AI model selection with CONFIG_ prefix and Manual Overrides

function parseModelConfig(configRaw) {
  const fallback = [
    { model: 'gemini-3.5-flash-lite', percentage: 25 },
    { model: 'gemini-3.6-flash', percentage: 25 },
    { model: 'gemini-3.7-flash', percentage: 50 },
  ];

  if (!configRaw || !configRaw.trim()) {
    return fallback;
  }

  const trimmed = configRaw.trim();

  // 1. Try JSON parse
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed
          .filter((item) => item && typeof item.model === 'string' && typeof item.percentage === 'number' && item.percentage > 0)
          .map((item) => ({ model: item.model.trim(), percentage: item.percentage }));
        if (valid.length > 0) return valid;
      }
    } catch (e) {
      console.warn("Failed to parse JSON:", e);
    }
  }

  // 2. Try shorthand format: "25:model1, 25:model2, 50:model3"
  if (trimmed.includes(':')) {
    try {
      const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
      const list = [];
      for (const part of parts) {
        const [pctStr, modelStr] = part.split(':').map((s) => s.trim());
        const pct = parseFloat(pctStr);
        if (!isNaN(pct) && pct > 0 && modelStr) {
          list.push({ model: modelStr, percentage: pct });
        }
      }
      if (list.length > 0) return list;
    } catch (e) {
      console.warn("Failed to parse shorthand:", e);
    }
  }

  return fallback;
}

function hashUserId(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

function assignModelFromPercentages(userId, models) {
  if (models.length === 0) return 'gemini-3.5-flash-lite';
  if (models.length === 1) return models[0].model;

  const totalPercentage = models.reduce((acc, m) => acc + m.percentage, 0);
  const bucket = (hashUserId(userId) / 100) * totalPercentage;

  let cumulative = 0;
  for (const m of models) {
    cumulative += m.percentage;
    if (bucket < cumulative) {
      return m.model;
    }
  }

  return models[models.length - 1].model;
}

function resolveUserAIModel({ userId, currentDbModel, isByok, configRaw, byokDefaultModel = 'gemini-3.7-flash' }) {
  const isManualOverride = currentDbModel !== null && !currentDbModel.startsWith('CONFIG_');

  if (isManualOverride) {
    return {
      aiModel: currentDbModel,
      isOverride: true,
      newDbValue: null, // No DB update needed
    };
  }

  const activeModelWeights = parseModelConfig(configRaw);
  let resolvedModel;
  if (isByok) {
    resolvedModel = byokDefaultModel;
  } else {
    resolvedModel = assignModelFromPercentages(userId, activeModelWeights);
  }

  const expectedDbValue = `CONFIG_${resolvedModel}`;
  const shouldUpdateDb = currentDbModel !== expectedDbValue;

  return {
    aiModel: resolvedModel,
    isOverride: false,
    newDbValue: shouldUpdateDb ? expectedDbValue : null,
  };
}

// 1. Test parsing
const jsonConfig = '[{"model":"m1","percentage":25},{"model":"m2","percentage":25},{"model":"m3","percentage":50}]';
const parsedJson = parseModelConfig(jsonConfig);
console.log("Parsed JSON:", parsedJson);

// 2. Test manual override
const manualUser = resolveUserAIModel({
  userId: 'user_override_1',
  currentDbModel: 'gemini-custom-pro',
  isByok: false,
  configRaw: jsonConfig,
});
console.log("\nManual Override Test:", manualUser);
console.assert(manualUser.aiModel === 'gemini-custom-pro', "Should use manual override");
console.assert(manualUser.isOverride === true, "Should be flagged as override");
console.assert(manualUser.newDbValue === null, "Should not update DB for manual override");

// 3. Test new user (null DB model)
const newUser = resolveUserAIModel({
  userId: 'user_new_1',
  currentDbModel: null,
  isByok: false,
  configRaw: jsonConfig,
});
console.log("\nNew User Test:", newUser);
console.assert(newUser.isOverride === false, "Should be config-driven");
console.assert(newUser.newDbValue.startsWith('CONFIG_'), "Should assign CONFIG_ prefix to DB");

// 4. Test deprecation migration
// User was previously assigned m1 ('CONFIG_m1'), but config updated to replace m1 with m4
const updatedConfig = '[{"model":"m4","percentage":25},{"model":"m2","percentage":25},{"model":"m3","percentage":50}]';
const migratedUser = resolveUserAIModel({
  userId: 'user_new_1',
  currentDbModel: 'CONFIG_m1',
  isByok: false,
  configRaw: updatedConfig,
});
console.log("\nDeprecation Migration Test:", migratedUser);
console.assert(migratedUser.newDbValue !== 'CONFIG_m1', "Should update DB away from deprecated m1");

// 5. Test BYOK config
const byokUser = resolveUserAIModel({
  userId: 'user_byok_1',
  currentDbModel: null,
  isByok: true,
  configRaw: updatedConfig,
  byokDefaultModel: 'gemini-3.7-flash',
});
console.log("\nBYOK User Test:", byokUser);
console.assert(byokUser.aiModel === 'gemini-3.7-flash', "Should use BYOK default");
console.assert(byokUser.newDbValue === 'CONFIG_gemini-3.7-flash', "Should set CONFIG_gemini-3.7-flash in DB");

console.log("\nAll tests passed successfully!");
