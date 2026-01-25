import { ScenarioRepository } from "../scenarioRepositories";

jest.mock("../../config/database", () => {
  return {
    pool: {
      query: jest.fn(),
      connect: jest.fn(),
    },
  };
});

import { pool } from "../../config/database";

describe("ScenarioRepository.transferOwnership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockCommon({ udt_name }: { udt_name: string }) {
    (pool.query as unknown as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      const q = String(sql);
      if (q.includes("to_regclass")) return Promise.resolve({ rows: [{ exists: true }] });
      if (q.includes("information_schema.columns") && params?.[0] === "scenarios") {
        return Promise.resolve({
          rows: [{ column_name: "gm_user_ids", data_type: "ARRAY", udt_name }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const client = {
      query: jest.fn(async (sql: string) => {
        const q = String(sql);
        if (q.includes("SELECT 1 FROM scenarios")) return { rows: [{}] };
        if (q.includes("SELECT 1 FROM scenario_players")) return { rows: [{}] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    (pool.connect as unknown as jest.Mock).mockResolvedValue(client);
    return client;
  }

  it("overwrites gm_user_ids to only the new owner (uuid[])", async () => {
    const client = mockCommon({ udt_name: "_uuid" });

    const repo = new ScenarioRepository();
    jest.spyOn(repo, "getById").mockResolvedValue({ id: "s1" } as any);

    await repo.transferOwnership({ scenarioId: "s1", fromUserId: "u_old", toUserId: "u_new" });

    const gmCall = (client.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes("SET gm_user_ids"));
    expect(gmCall).toBeTruthy();
    expect(String(gmCall![0])).toContain("::uuid");
    expect(gmCall![1]).toEqual(["u_new", "s1"]);
  });

  it("overwrites gm_user_ids to only the new owner (text[])", async () => {
    const client = mockCommon({ udt_name: "_text" });

    const repo = new ScenarioRepository();
    jest.spyOn(repo, "getById").mockResolvedValue({ id: "s1" } as any);

    await repo.transferOwnership({ scenarioId: "s1", fromUserId: "u_old", toUserId: "u_new" });

    const gmCall = (client.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes("SET gm_user_ids"));
    expect(gmCall).toBeTruthy();
    expect(String(gmCall![0])).not.toContain("::uuid");
    expect(gmCall![1]).toEqual(["u_new", "s1"]);
  });
});
