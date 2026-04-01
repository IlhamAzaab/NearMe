import express from "express";
import { handleSupabaseSendSmsHook } from "../controllers/smsHookController.js";

const router = express.Router();

router.post("/send-sms-hook", handleSupabaseSendSmsHook);

export default router;
