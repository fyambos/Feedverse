import express from "express";
import bodyParser from "body-parser";
import authRouter from "./auth/authRouter";
import userRouter from "./users/userRouter";
import { APP_CONFIG } from "./config/constants";
import { ROUTES_AUTH, ROUTES_USERS } from "./config/constants";
import { CLOUDFLARE_S3 } from "./config/cloudflare";
import { ListBucketsCommand } from "@aws-sdk/client-s3";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(ROUTES_AUTH.BASE, authRouter);
app.use(ROUTES_USERS.BASE, userRouter);

const AppStart = async () => {
  console.log(
    `L'application est lançée à l'adresse : ${APP_CONFIG.ENVIRONMENT}:${APP_CONFIG.SERVER_PORT}`,
  );
  console.log(
    `Bucket Cloudflare :`,
    await CLOUDFLARE_S3.send(new ListBucketsCommand({})),
  );
};

app.listen(APP_CONFIG.SERVER_PORT, AppStart);

export default app;
