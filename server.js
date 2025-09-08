// express-locker-server-auth.js
// Full server with simple session-based authentication (username: installation, password: install123)

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const Locker = require("./models/locker.js");
const https = require("https");
const ejsMate = require("ejs-mate");
const flash = require("connect-flash");
const compression = require("compression");

const app = express();
const server = http.createServer(app);

const MONGO_URI =
  "mongodb+srv://vivekkaushik2005:0OShH2EJiRwMSt4m@cluster0.vaqwvzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

app.use(compression());
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ------------------ Simple admin credentials ------------------
const ADMIN_USER = process.env.ADMIN_USER || "installation";
const ADMIN_PASS = process.env.ADMIN_PASS || "install123";

function checkInternet(cb) {
  const req = https.get("https://www.google.com", (res) => {
    cb(true);
    req.destroy();
  });
  req.on("error", () => cb(false));
  req.setTimeout(3000, () => {
    req.destroy();
    cb(false);
  });
}

// --- Step 2: Connect Mongo ---
async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("🔁 Exiting, will restart when PM2 restarts the process...");
    process.exit(1);
  }
}

function waitForInternet(retries = 20) {
  checkInternet((connected) => {
    if (connected) {
      console.log("🌍 Internet detected, trying MongoDB...");
      connectMongo();
    } else {
      if (retries <= 0) {
        console.error("❌ Internet not available after retries, exiting.");
        process.exit(1);
      }
      console.log("❌ No internet yet, retrying in 5s...");
      setTimeout(() => waitForInternet(retries - 1), 5000);
    }
  });
}

waitForInternet();

app.use(
  session({
    secret: process.env.SESSION_SECRET || "heeeheheah",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      ttl: 60 * 60 * 24 * 7,
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash("success"),
    error: req.flash("error"),
  };
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ------------------ Authentication middleware ------------------
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user && req.session.user.username === ADMIN_USER) {
    return next();
  }
  if (req.xhr || req.headers.accept.indexOf("json") > -1) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.redirect("/login");
}

// ------------------ Routes ------------------
app.get("/login", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/");
  const error = req.flash("error") || [];
  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login</title>
    <style>
      body {margin:0;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#74ebd5 0%,#9face6 100%);display:flex;align-items:center;justify-content:center;height:100vh;}
      .login-card {background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,0.15);max-width:360px;width:100%;text-align:center;}
      .login-card h2 {margin-bottom:1.5rem;color:#333;}
      .login-card form {display:flex;flex-direction:column;gap:1rem;}
      .login-card label {text-align:left;font-size:0.9rem;color:#555;}
      .login-card input {width:100%;padding:0.7rem;border:1px solid #ccc;border-radius:8px;font-size:1rem;transition:border 0.2s;}
      .login-card input:focus {border-color:#6a5acd;outline:none;}
      .login-card button {background:#6a5acd;color:white;border:none;padding:0.8rem;border-radius:8px;font-size:1rem;cursor:pointer;transition:background 0.3s;}
      .login-card button:hover {background:#5848c2;}
      .error-message {color:red;margin-bottom:1rem;font-size:0.9rem;}
    </style>
  </head>
  <body>
    <div class="login-card">
      <h2>🔐 Install Login</h2>
      ${error.length ? `<p class="error-message">${error.join("<br>")}</p>` : ""}
      <form method="POST" action="/login">
        <div>
          <label for="username">Username</label>
          <input id="username" name="username" required />
        </div>
        <div>
          <label for="password">Password</label>
          <input id="password" type="password" name="password" required />
        </div>
        <button type="submit">Login</button>
      </form>
    </div>
  </body>
</html>`;
  res.send(html);
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = { username: ADMIN_USER };
    req.flash("success", "Logged in successfully");
    return res.redirect("/");
  }
  req.flash("error", "Invalid credentials");
  return res.redirect("/login");
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("session destroy error", err);
    res.redirect("/login");
  });
});

// Protect the main page and add-locker route with ensureAuthenticated
app.get("/", ensureAuthenticated, (req, res) => {
  res.render("addLocker", { error: null, success: null });
});

app.post('/add-locker', ensureAuthenticated, async (req, res) => {
  try {
    const { lockerId, address, lat, lng, compartments } = req.body;

    if (!lockerId || !address || !lat || !lng) {
      return res.render('addLocker', {
        messages: { error: ['All fields are required.'] }
      });
    }
    
    let formattedCompartments = [];
    if (compartments && Array.isArray(compartments)) {
      formattedCompartments = compartments.map(c => ({
        compartmentId: c.compartmentId,
        size: c.size || 'medium'
      }));
    }

    const newLocker = new Locker({
      lockerId,
      location: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address
      },
      compartments: formattedCompartments
    });

    await newLocker.save();

    res.render('addLocker', {
      messages: { success: [`Locker ${lockerId} added successfully!`] }
    });
  } catch (err) {
    console.error(err);
    res.render('addLocker', {
      messages: { error: ['Failed to add locker. Try again.'] }
    });
  }
});
app.get('/lockers', ensureAuthenticated, async (req, res, next) => {
  try {
    // Prefer createdAt if your schema has timestamps, otherwise sort by _id (ObjectId roughly increases over time)
    const sortField = (Locker.schema && Locker.schema.paths && Locker.schema.paths.createdAt) ? { createdAt: -1 } : { _id: -1 };

    const lockers = await Locker.find({}).sort(sortField).lean();

    res.render('lockers', { lockers, messages: req.flash() });
  } catch (err) {
    next(err);
  }
});


// API: delete locker by ID
app.delete('/api/locker/:lockerId', ensureAuthenticated, async (req, res, next) => {
  try {
    const { lockerId } = req.params;

    const deleted = await Locker.findOneAndDelete({ lockerId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Locker not found' });
    }

    res.json({ success: true, message: `Locker ${lockerId} deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete locker' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("errorpage", {
    errorMessage: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 6010;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
