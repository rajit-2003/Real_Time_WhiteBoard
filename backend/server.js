const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const connectToDB = require("./config/db");
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

// --------------------------
// 🔥 GLOBAL MIDDLEWARE LOGS
// --------------------------
console.log("🚀 Starting Server...");
console.log("📦 Environment Loaded:", process.env.NODE_ENV);
console.log("🔑 Using JWT_SECRET:", SECRET_KEY ? "YES" : "NO");

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);

// --------------------------
// 🔧 CONNECT DB
// --------------------------
connectToDB();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://whiteboard-tutorial-eight.vercel.app"],
        methods: ["GET", "POST"],
    },
});

let canvasData = {};
let i = 0;

// ===============================
// 🔥 SOCKET CONNECTION LOGS
// ===============================
io.on("connection", (socket) => {
    console.log("🟢 A user connected:", socket.id);
    console.log("🔍 Socket Headers:", socket.handshake.headers);

    // -----------------------------------
    // 📌 JOIN CANVAS EVENT
    // -----------------------------------
    socket.on("joinCanvas", async ({ canvasId }) => {
        console.log("\n🚪 joinCanvas Triggered");
        console.log("📝 Canvas ID:", canvasId);

        try {
            // Get token
            const authHeader = socket.handshake.headers.authorization;
            console.log("🔐 Authorization Header:", authHeader);

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                console.log("❌ Token Missing in joinCanvas");
                setTimeout(() => {
                    socket.emit("unauthorized", { message: "Access Denied: No Token" });
                }, 100);
                return;
            }

            // Decode token
            const token = authHeader.split(" ")[1];
            console.log("🔑 Extracted Token:", token);

            const decoded = jwt.verify(token, SECRET_KEY);
            console.log("🧾 Decoded Token:", decoded);

            const userId = decoded.userId;
            console.log("👤 User ID from Token:", userId);

            // Find Canvas
            console.log("📡 Fetching Canvas from DB...");
            const canvas = await Canvas.findById(canvasId);
            console.log("📄 Canvas Found:", canvas);

            if (!canvas) {
                console.log("❌ Canvas Not Found!");
                setTimeout(() => {
                    socket.emit("unauthorized", { message: "Canvas does not exist." });
                }, 100);
                return;
            }

            // Authorization Check
            console.log("🔍 Checking ownership...");
            if (
                String(canvas.owner) !== String(userId) &&
                !canvas.shared.includes(userId)
            ) {
                console.log("⛔ Unauthorized access to canvas");
                setTimeout(() => {
                    socket.emit("unauthorized", { message: "Not authorized to join this canvas." });
                }, 100);
                return;
            }

            // Join Room
            socket.join(canvasId);
            console.log(`🎉 User ${socket.id} joined canvas room ${canvasId}`);

            // Load Canvas
            if (canvasData[canvasId]) {
                console.log("📤 Sending cached canvas data...");
                socket.emit("loadCanvas", canvasData[canvasId]);
            } else {
                console.log("📤 Sending database canvas data...");
                socket.emit("loadCanvas", canvas.elements);
            }
        } catch (error) {
            console.error("🔥 ERROR in joinCanvas:", error.message);
            socket.emit("error", {
                message: "Error while joining the canvas",
                error: error.message,
            });
        }
    });

    // -----------------------------------
    // 🎨 DRAWING UPDATE
    // -----------------------------------
    socket.on("drawingUpdate", async ({ canvasId, elements }) => {
        try {
            console.log("\n✏ drawingUpdate Triggered");
            console.log("📝 Canvas:", canvasId);
            console.log("🔢 Elements Count:", elements.length);

            canvasData[canvasId] = elements;

            // Broadcast to others
            socket.to(canvasId).emit("receiveDrawingUpdate", elements);
            console.log("📡 Update broadcasted to room:", canvasId);

            // Update DB
            const canvas = await Canvas.findById(canvasId);
            if (canvas) {
                console.log("💾 Saving canvas to DB...");
                await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true });
            } else {
                console.log("⚠ Canvas Not Found While Saving");
            }
        } catch (error) {
            console.error("🔥 ERROR in drawingUpdate:", error.message);
        }
    });

    // -----------------------------------
    // 🔌 DISCONNECT
    // -----------------------------------
    socket.on("disconnect", () => {
        console.log("🔴 User disconnected:", socket.id);
    });
});

// --------------------------
// 🚀 START SERVER
// --------------------------
server.listen(5000, () => {
    console.log("✅ Server running on port 5000");
});
