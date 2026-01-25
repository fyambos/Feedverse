import request from "supertest";
import { createApp } from "../../app";

describe("health endpoints", () => {
  const app = createApp();

  test("GET /healthz always returns 200", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("db");
    expect(typeof res.body.uptimeSec).toBe("number");
  });

  test("GET /readyz returns 200 when ready, else 503", async () => {
    const res = await request(app).get("/readyz");

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("db");

    if (res.status === 200) {
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body.db).toHaveProperty("ok", true);
    } else {
      expect(res.body).toHaveProperty("ok", false);
      expect(res.body.db).toHaveProperty("ok", false);
    }
  });
});
