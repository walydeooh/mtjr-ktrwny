import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productsRouter from "./products";
import customersRouter from "./customers";
import ordersRouter from "./orders";
import bookingsRouter from "./bookings";
import whatsappRouter from "./whatsapp";
import settingsRouter from "./settings";
import statsRouter from "./stats";
import customerAuthRouter from "./customer-auth";
import myOrdersRouter from "./my-orders";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(ordersRouter);
router.use(bookingsRouter);
router.use(whatsappRouter);
router.use(settingsRouter);
router.use(statsRouter);
router.use(customerAuthRouter);
router.use(myOrdersRouter);
router.use(paymentsRouter);

export default router;
