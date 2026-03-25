import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Backend is working");
});

app.post("/api/whisper/transcribe", (req, res) => {
  upload.any()(req, res, async (err) => {
    let tempPath = null;

    try {
      console.log("Whisper route hit:", new Date().toISOString());

      if (err instanceof multer.MulterError) {
        console.error("Multer error:", err);
        return res.status(400).json({
          error: "Multer upload error",
          details: err.message,
        });
      }

      if (err) {
        console.error("Upload error:", err);
        return res.status(500).json({
          error: "Upload failed",
          details: err.message,
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: "No audio file uploaded",
        });
      }

      const audioFile = req.files[0];
      tempPath = audioFile.path;

      console.log("Received file:", {
        fieldname: audioFile.fieldname,
        originalname: audioFile.originalname,
        mimetype: audioFile.mimetype,
        size: audioFile.size,
      });

      console.log("Preparing file for OpenAI...");

      const fileForOpenAI = await toFile(
        fs.createReadStream(tempPath),
        audioFile.originalname || "recording.webm"
      );

      console.log("Sending file to OpenAI...");

      const transcription = await openai.audio.transcriptions.create({
        file: fileForOpenAI,
        model: "whisper-1",
      });

      const transcriptText = (transcription.text || "").trim();

      console.log("OpenAI response received");
      console.log("Transcription text:", transcriptText);

      return res.status(200).json({
        success: true,
        text: transcriptText,
        feedback: transcriptText
          ? "Speech received successfully."
          : "No clear speech detected.",
      });
    } catch (error) {
      console.error("Transcription error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to transcribe audio",
        details: error.message || "Unknown error",
      });
    } finally {
      try {
        if (tempPath && fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.error("Failed to clean temp file:", cleanupError);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});