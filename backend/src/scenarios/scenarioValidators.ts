import {
  SCENARIO_MESSAGES,
  SCENARIO_VALIDATION_RULES,
} from "../config/constants";
import { ValidationError } from "../utils/models";
import { ScenarioMode } from "./scenarioModels";

export const validateScenarioName = (name: string): ValidationError | null => {
  if (!name || name.trim().length === 0) {
    return {
      fields: SCENARIO_MESSAGES.NAME,
      message: "Le nom du scénario est requis",
    };
  }

  if (name.length < SCENARIO_VALIDATION_RULES.NAME.MIN_LENGTH) {
    return {
      fields: SCENARIO_MESSAGES.NAME,
      message: `Le nom doit contenir au moins ${SCENARIO_VALIDATION_RULES.NAME.MIN_LENGTH} caractères`,
    };
  }

  if (name.length > SCENARIO_VALIDATION_RULES.NAME.MAX_LENGTH) {
    return {
      fields: SCENARIO_MESSAGES.NAME,
      message: `Le nom ne peut pas dépasser ${SCENARIO_VALIDATION_RULES.NAME.MAX_LENGTH} caractères`,
    };
  }

  return null;
};

export const validateScenarioDescription = (
  description: string | null,
): ValidationError | null => {
  if (
    description &&
    description.length > SCENARIO_VALIDATION_RULES.DESCRIPTION.MAX_LENGTH
  ) {
    return {
      fields: SCENARIO_MESSAGES.DESCRIPTION,
      message: `La description ne peut pas dépasser ${SCENARIO_VALIDATION_RULES.DESCRIPTION.MAX_LENGTH} caractères`,
    };
  }

  return null;
};

export const validateInviteCode = (
  inviteCode: string,
): ValidationError | null => {
  if (!inviteCode || inviteCode.trim().length === 0) {
    return {
      fields: SCENARIO_MESSAGES.INVITE_CODE,
      message: "Le code d'invitation est requis",
    };
  }

  if (inviteCode.length < SCENARIO_VALIDATION_RULES.INVITE_CODE.MIN_LENGTH) {
    return {
      fields: SCENARIO_MESSAGES.INVITE_CODE,
      message: `Le code d'invitation doit contenir au moins ${SCENARIO_VALIDATION_RULES.INVITE_CODE.MIN_LENGTH} caractères`,
    };
  }

  if (inviteCode.length > SCENARIO_VALIDATION_RULES.INVITE_CODE.MAX_LENGTH) {
    return {
      fields: SCENARIO_MESSAGES.INVITE_CODE,
      message: `Le code d'invitation ne peut pas dépasser ${SCENARIO_VALIDATION_RULES.INVITE_CODE.MAX_LENGTH} caractères`,
    };
  }

  if (!SCENARIO_VALIDATION_RULES.INVITE_CODE.PATTERN.test(inviteCode)) {
    return {
      fields: SCENARIO_MESSAGES.INVITE_CODE,
      message:
        "Le code d'invitation ne peut contenir que des lettres majuscules et des chiffres",
    };
  }

  return null;
};

export const validateScenarioMode = (mode: string): ValidationError | null => {
  if (
    !SCENARIO_VALIDATION_RULES.MODE.ALLOWED_VALUES.includes(
      mode as ScenarioMode,
    )
  ) {
    return {
      fields: SCENARIO_MESSAGES.MODE,
      message: `Le mode doit être 'story' ou 'campaign'`,
    };
  }

  return null;
};
