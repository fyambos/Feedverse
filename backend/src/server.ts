import express from "express";
import bodyParser from "body-parser";
import authRouter from "./auth/authRouter";
import userRouter from "./users/userRouter";
import { APP_CONFIG } from "./config/constants";
import { ROUTES_AUTH, ROUTES_USERS } from "./config/constants";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(ROUTES_AUTH.BASE, authRouter);
app.use(ROUTES_USERS.BASE, userRouter);

const AppStart = async () => {
  console.log(
    `L'application est lançée à l'adresse : ${APP_CONFIG.ENVIRONMENT}:${APP_CONFIG.SERVER_PORT}`,
  );
};

app.listen(APP_CONFIG.SERVER_PORT, AppStart);

export default app;
