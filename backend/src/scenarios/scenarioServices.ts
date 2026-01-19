import { v4 as uuidv4 } from "uuid";
import { ValidationError } from "../utils/models";
import {
  CreateScenarioRequest,
  CreateScenarioResponse,
  GetScenarioPlayersResponse,
  Scenario,
  TransferScenarioOwnershipRequest,
  TransferScenarioOwnershipResponse,
  UpdateScenarioData,
  UpdateScenarioRequest,
  UpdateScenarioResponse,
} from "./scenarioModels";
import {
  validateScenarioName,
  validateScenarioDescription,
  validateInviteCode,
  validateScenarioMode,
} from "./scenarioValidators";
import { APP_CONFIG, SCENARIO_MESSAGES } from "../config/constants";
import { ScenarioRepository } from "./scenarioRepositories";
import { UserRepository } from "../users/userRepositories";

const scenarioRepository = new ScenarioRepository();
const userRepository = new UserRepository();

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

  await scenarioRepository.addPlayer(uuid, ownerUserId);

  const scenario: CreateScenarioResponse = {
    message: SCENARIO_MESSAGES.CREATION_SUCCESS,
    Scenario: scenarioCreated,
  };

  return { scenario };
};

export const GetScenarioByIdService = async (
  scenarioId: string,
  userId: string,
): Promise<{
  scenario?: Scenario;
  errors?: ValidationError[];
}> => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(scenarioId)) {
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  const scenario = await scenarioRepository.findById(scenarioId);

  if (!scenario) {
    console.error(userId);
    return {
      errors: [
        {
          fields: "id",
          message: SCENARIO_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  /*
  PLUS TARD :
  Vérifier si l'utilisateur a accès au scénario (membre du scénario ou scénario public).
  */
  return { scenario };
};

export const UpdateScenarioService = async (
  scenarioId: string,
  userId: string,
  input: UpdateScenarioRequest,
  coverFile?: Express.Multer.File,
): Promise<{
  scenario?: UpdateScenarioResponse;
  errors?: ValidationError[];
}> => {
  const { name, description, invite_code } = input;
  const errors: ValidationError[] = [];

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(scenarioId)) {
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  const existingScenario = await scenarioRepository.findById(scenarioId);

  if (!existingScenario) {
    return {
      errors: [
        {
          fields: "id",
          message: SCENARIO_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  if (existingScenario.owner_user_id !== userId) {
    return {
      errors: [
        {
          fields: "authorization",
          message: "Seul le propriétaire peut modifier ce scénario",
        },
      ],
    };
  }

  if (name !== undefined) {
    const nameError = validateScenarioName(name);
    if (nameError) errors.push(nameError);
  }

  if (description !== undefined) {
    const descriptionError = validateScenarioDescription(description);
    if (descriptionError) errors.push(descriptionError);
  }

  if (invite_code !== undefined) {
    const inviteCodeError = validateInviteCode(invite_code);
    if (inviteCodeError) {
      errors.push(inviteCodeError);
    } else {
      const inviteCodeExists = await scenarioRepository.inviteCodeExists(
        invite_code.toUpperCase(),
      );

      if (
        inviteCodeExists &&
        invite_code.toUpperCase() !== existingScenario.invite_code
      ) {
        errors.push({
          fields: SCENARIO_MESSAGES.INVITE_CODE,
          message: SCENARIO_MESSAGES.INVITE_CODE_ALREADY_EXISTS,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const updateData: Partial<UpdateScenarioData> = {};

  if (name !== undefined) {
    updateData.name = name.trim();
  }

  if (description !== undefined) {
    updateData.description = description.trim() || null;
  }

  if (invite_code !== undefined) {
    updateData.invite_code = invite_code.toUpperCase();
  }

  const updatedScenario = await scenarioRepository.update(
    scenarioId,
    updateData,
    coverFile,
  );

  const scenario: UpdateScenarioResponse = {
    message: SCENARIO_MESSAGES.UPDATE_SUCCESS,
    scenario: updatedScenario,
  };

  return { scenario };
};

export const DeleteScenarioService = async (
  scenarioId: string,
  userId: string,
): Promise<{
  success?: boolean;
  errors?: ValidationError[];
}> => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(scenarioId)) {
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  // Vérifier que le scénario existe
  const scenario = await scenarioRepository.findById(scenarioId);

  if (!scenario) {
    return {
      errors: [
        {
          fields: "id",
          message: SCENARIO_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  if (scenario.owner_user_id !== userId) {
    return {
      errors: [
        {
          fields: "authorization",
          message: SCENARIO_MESSAGES.UNAUTHORIZED,
        },
      ],
    };
  }

  const deleted = await scenarioRepository.delete(scenarioId);

  if (!deleted) {
    return {
      errors: [
        {
          fields: "id",
          message: "Échec de la suppression du scénario",
        },
      ],
    };
  }

  return { success: true };
};

export const GetScenarioPlayersService = async (
  scenarioId: string,
  userId: string,
): Promise<{
  players?: GetScenarioPlayersResponse;
  errors?: ValidationError[];
}> => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(scenarioId)) {
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant invalide",
        },
      ],
    };
  }

  const scenarioExists = await scenarioRepository.IdExists(scenarioId);

  if (!scenarioExists) {
    console.error("ID utilisateur non trouvé : ", userId);
    return {
      errors: [
        {
          fields: "id",
          message: SCENARIO_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  const playersList =
    await scenarioRepository.findPlayersByScenarioId(scenarioId);

  return {
    players: {
      players: playersList,
      count: playersList.length,
    },
  };
};

export const TransferScenarioOwnershipService = async (
  scenarioId: string,
  currentUserId: string,
  input: TransferScenarioOwnershipRequest,
): Promise<{
  scenario?: TransferScenarioOwnershipResponse;
  errors?: ValidationError[];
}> => {
  const { newOwnerUserId } = input;
  const errors: ValidationError[] = [];

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(scenarioId)) {
    console.error(errors);
    return {
      errors: [
        {
          fields: "id",
          message: "Format d'identifiant de scénario invalide",
        },
      ],
    };
  }

  if (!newOwnerUserId || newOwnerUserId.trim().length === 0) {
    return {
      errors: [
        {
          fields: SCENARIO_MESSAGES.NEW_OWNER_USER_ID,
          message: "L'identifiant du nouveau propriétaire est requis",
        },
      ],
    };
  }

  if (!uuidRegex.test(newOwnerUserId)) {
    return {
      errors: [
        {
          fields: SCENARIO_MESSAGES.NEW_OWNER_USER_ID,
          message: "Format d'identifiant du nouveau propriétaire invalide",
        },
      ],
    };
  }

  const existingScenario = await scenarioRepository.findById(scenarioId);

  if (!existingScenario) {
    return {
      errors: [
        {
          fields: "id",
          message: SCENARIO_MESSAGES.NOT_FOUND,
        },
      ],
    };
  }

  if (existingScenario.owner_user_id !== currentUserId) {
    return {
      errors: [
        {
          fields: "authorization",
          message: SCENARIO_MESSAGES.UNAUTHORIZED,
        },
      ],
    };
  }

  if (newOwnerUserId === currentUserId) {
    return {
      errors: [
        {
          fields: SCENARIO_MESSAGES.NEW_OWNER_USER_ID,
          message: SCENARIO_MESSAGES.CANNOT_TRANSFER_TO_SELF,
        },
      ],
    };
  }

  const newOwnerExists = await userRepository.findById(newOwnerUserId);

  if (!newOwnerExists) {
    return {
      errors: [
        {
          fields: SCENARIO_MESSAGES.NEW_OWNER_USER_ID,
          message: SCENARIO_MESSAGES.NEW_OWNER_NOT_FOUND,
        },
      ],
    };
  }

  const transferredScenario = await scenarioRepository.transferOwnership(
    scenarioId,
    newOwnerUserId,
    existingScenario.mode,
    currentUserId,
  );

  const scenario: TransferScenarioOwnershipResponse = {
    message: SCENARIO_MESSAGES.TRANSFER_SUCCESS,
    scenario: transferredScenario,
  };

  return { scenario };
};
