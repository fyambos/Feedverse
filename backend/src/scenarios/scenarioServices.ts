import { v4 as uuidv4 } from "uuid";
import { ValidationError } from "../utils/models";
import {
  CreateScenarioRequest,
  CreateScenarioResponse,
} from "./scenarioModels";
import {
  validateScenarioName,
  validateScenarioDescription,
  validateInviteCode,
  validateScenarioMode,
} from "./scenarioValidators";
import { APP_CONFIG, SCENARIO_MESSAGES } from "../config/constants";
import { ScenarioRepository } from "./scenarioRepositories";

const scenarioRepository = new ScenarioRepository();

export const CreateScenarioService = async (
  input: CreateScenarioRequest,
  ownerUserId: string,
  coverFile?: Express.Multer.File,
): Promise<{
  scenario?: CreateScenarioResponse;
  errors?: ValidationError[];
}> => {
  const { name, description, mode, invite_code } = input;

  const errors: ValidationError[] = [];

  const nameError = validateScenarioName(name);
  if (nameError) errors.push(nameError);

  const descriptionError = validateScenarioDescription(description);
  if (descriptionError) errors.push(descriptionError);

  const inviteCodeError = validateInviteCode(invite_code);
  if (inviteCodeError) errors.push(inviteCodeError);

  const modeError = validateScenarioMode(mode);
  if (modeError) errors.push(modeError);

  if (errors.length > 0) {
    return { errors };
  }

  const inviteCodeExists = await scenarioRepository.inviteCodeExists(
    invite_code.toUpperCase(),
  );

  if (inviteCodeExists) {
    return {
      errors: [
        {
          fields: SCENARIO_MESSAGES.INVITE_CODE,
          message: "Ce code d'invitation est déjà utilisé",
        },
      ],
    };
  }

  const uuid = uuidv4();
  const gmUserIds = mode === "campaign" ? [ownerUserId] : [];

  const scenarioCreated = await scenarioRepository.create(
    {
      id: uuid,
      name: name.trim(),
      description: description?.trim() || null,
      mode: mode,
      invite_code: invite_code.toUpperCase(),
      owner_user_id: ownerUserId,
      gm_user_ids: gmUserIds,
      settings: {},
      cover: APP_CONFIG.EMPTY_STRING,
      created_at: APP_CONFIG.NOW,
      updated_at: null,
    },
    coverFile,
  );

  const scenario: CreateScenarioResponse = {
    message: SCENARIO_MESSAGES.CREATION_SUCCESS,
    Scenario: scenarioCreated,
  };

  return { scenario };
};
