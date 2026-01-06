import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { CreateScenarioRequest, CreateScenarioResponse } from "./scenarioModels";
import {
  nameFormatting,
  validateEmail,
  validatePassword,
} from "./authValidators";
import { APP_CONFIG, ERROR_MESSAGES, SCENARIO_MESSAGES, VALIDATION } from "../config/constants";
import { ScenarioRepository } from "../scenarios/scenarioRepositories";
import { ValidationError } from "../auth/authModels";

const scenarioRepository = new ScenarioRepository();

export const CreateScenarioService = async (
  input: CreateScenarioRequest,
  coverFile?: Express.Multer.File,
): Promise<{ Scenario?: CreateScenarioResponse; errors?: ValidationError[] }> => {
  const { name, description, mode, invite_code, cover } = input;

  // const errors: ValidationError[] = [];

  // const emailError = validateEmail(email);
  // if (emailError) errors.push(emailError);

  // const passwordError = validatePassword(password_hash);
  // if (passwordError) errors.push(passwordError);

  // if (errors.length > 0) {
  //   return { errors };
  // }

  // const emailExists = await ScenarioRepository.emailExists(email);

  // if (emailExists) {
  //   return {
  //     errors: [
  //       {
  //         fields: Scenario_MESSAGES.EMAIL,
  //         message: Scenario_MESSAGES.EMAIL_ALREADY_EXISTS,
  //       },
  //     ],
  //   };
  // }

  const uuid = uuidv4();
  // const nameFormatted = nameFormatting(Scenarioname);

  const scenarioCreated = await ScenarioRepository.create(
    {
      id: uuid,
      name: name,
      description: description,
      mode: mode,
      invite_code: invite_code,
      owner_user_id: ,
      gm_user_ids,
      settings,
      cover: coverFile || APP_CONFIG.EMPTY_STRING,
      created_at: APP_CONFIG.NOW,
      updated_at: APP_CONFIG.NOW,
    },
    coverFile,
  );

  const Scenario: CreateScenarioResponse = {
    message: SCENARIO_MESSAGES.CREATION_SUCCESS,
    Scenario: {
      id: scenarioCreated.id,
      name: scenarioCreated.name,
      description: scenarioCreated.description,
      mode: scenarioCreated.mode,
      invite_code: scenarioCreated.invite_code,
      cover: scenarioCreated.cover,
      owner_user_id,
      gm_user_ids,
      settings,
      created_at: scenarioCreated.created_at,
      updated_at: scenarioCreated.updated_at,
    },
  };

  return { Scenario };
};

export const LoginScenarioService = async (
  input: LoginRequest,
): Promise<{ Scenario?: LoginResponse; error?: unknown }> => {
  const { email, password_hash } = input;

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password_hash);

  if (emailError || passwordError) {
    return { error: ERROR_MESSAGES.INVALID_EMAIL_OR_PASSWORD };
  }

  const ScenarioFetched = await ScenarioRepository.findByEmail(email);

  if (!ScenarioFetched) {
    return { error: Scenario_MESSAGES.DOES_NOT_EXISTS };
  }

  const hashedPassword: string = ScenarioFetched.password_hash;

  const isPasswordValid = await bcrypt.compare(password_hash, hashedPassword);

  if (!isPasswordValid) {
    return { error: VALIDATION.INVALID_PASSWORD };
  }

  /*
  const loginDate = new Date();
  await ScenarioRepository.updateLastLogin(email, loginDate);
  const { password_hash: _pwd, ...ScenarioWithoutPassword } = ScenarioFetched;

  return { Scenario: ScenarioWithoutPassword as LoginResponse };
  */
};
