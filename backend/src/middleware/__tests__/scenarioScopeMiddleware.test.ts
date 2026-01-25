import { getScenarioRole, requireScenarioMember, requireScenarioOwner } from "../scenarioScopeMiddleware";
import { ScenarioRepository } from "../../scenarios/scenarioRepositories";

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
}

describe("scenarioScopeMiddleware", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getScenarioRole", () => {
    it("returns owner when owner_user_id matches", async () => {
      const repo: any = {
        getById: jest.fn(async () => ({ id: "s1", owner_user_id: "u1", gm_user_ids: [] })),
        isUserInScenario: jest.fn(async () => false),
      };

      await expect(getScenarioRole({ scenarioId: "s1", userId: "u1", repo })).resolves.toBe("owner");
    });

    it("returns gm when gm_user_ids contains user", async () => {
      const repo: any = {
        getById: jest.fn(async () => ({ id: "s1", owner_user_id: "u2", gm_user_ids: ["u1"] })),
        isUserInScenario: jest.fn(async () => false),
      };

      await expect(getScenarioRole({ scenarioId: "s1", userId: "u1", repo })).resolves.toBe("gm");
    });

    it("returns member when in scenario_players", async () => {
      const repo: any = {
        getById: jest.fn(async () => ({ id: "s1", owner_user_id: "u2", gm_user_ids: [] })),
        isUserInScenario: jest.fn(async () => true),
      };

      await expect(getScenarioRole({ scenarioId: "s1", userId: "u1", repo })).resolves.toBe("member");
    });

    it("returns null when not a member", async () => {
      const repo: any = {
        getById: jest.fn(async () => ({ id: "s1", owner_user_id: "u2", gm_user_ids: [] })),
        isUserInScenario: jest.fn(async () => false),
      };

      await expect(getScenarioRole({ scenarioId: "s1", userId: "u1", repo })).resolves.toBeNull();
    });
  });

  describe("requireScenarioMember", () => {
    it("allows owner", async () => {
      jest.spyOn(ScenarioRepository.prototype, "getById").mockResolvedValue({ id: "s1", owner_user_id: "u1" } as any);
      jest.spyOn(ScenarioRepository.prototype, "isUserInScenario").mockResolvedValue(false);

      const req: any = { user: { id: "u1" }, params: { id: "s1" } };
      const res = makeRes();
      const next = jest.fn();

      await requireScenarioMember()(req, res as any, next);
      expect(next).toHaveBeenCalled();
      expect(req.scenarioRole).toBe("owner");
    });

    it("blocks non-members", async () => {
      jest.spyOn(ScenarioRepository.prototype, "getById").mockResolvedValue({ id: "s1", owner_user_id: "u2" } as any);
      jest.spyOn(ScenarioRepository.prototype, "isUserInScenario").mockResolvedValue(false);

      const req: any = { user: { id: "u1" }, params: { id: "s1" } };
      const res = makeRes();
      const next = jest.fn();

      await requireScenarioMember()(req, res as any, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe("requireScenarioOwner", () => {
    it("allows owner", async () => {
      jest.spyOn(ScenarioRepository.prototype, "getById").mockResolvedValue({ id: "s1", owner_user_id: "u1" } as any);
      jest.spyOn(ScenarioRepository.prototype, "isUserInScenario").mockResolvedValue(true);

      const req: any = { user: { id: "u1" }, params: { id: "s1" } };
      const res = makeRes();
      const next = jest.fn();

      await requireScenarioOwner()(req, res as any, next);
      expect(next).toHaveBeenCalled();
      expect(req.scenarioRole).toBe("owner");
    });

    it("blocks members", async () => {
      jest.spyOn(ScenarioRepository.prototype, "getById").mockResolvedValue({ id: "s1", owner_user_id: "u2" } as any);
      jest.spyOn(ScenarioRepository.prototype, "isUserInScenario").mockResolvedValue(true);

      const req: any = { user: { id: "u1" }, params: { id: "s1" } };
      const res = makeRes();
      const next = jest.fn();

      await requireScenarioOwner()(req, res as any, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });
});
