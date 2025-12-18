const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Robust .env loading: Check multiple locations and extensions (fix for Windows .txt issue)
const possibleEnvPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env.txt'),
  path.resolve(__dirname, '../.env.txt')
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`✅ Loading environment from: ${envPath}`);
    dotenv.config({ path: envPath });
    break;
  }
}

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const phonePeRoutes = require('./phonepe');
let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  console.log('ℹ️  Razorpay package not found. To enable real payments: npm install razorpay');
}

const app = express();
const PORT = process.env.PORT || 5003;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_this';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/expense-tracker';
const DB_NAME = 'expense-tracker';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिंदी)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'od', name: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'as', name: 'Assamese (অসমীয়া)' }
];

let baseUrl = process.env.BASE_URL || 'https://expense-tracking-web-applications.onrender.com';
// Fix common URL formatting issues (missing slashes)
if (baseUrl.startsWith('https:') && !baseUrl.includes('://')) baseUrl = baseUrl.replace('https:', 'https://');
const BASE_URL = baseUrl;

// Trust proxy for correct protocol detection on Render/Vercel
app.set('trust proxy', 1);

console.log(`🌍 Base URL: ${BASE_URL}`);

console.log('🔍 Environment Check:');
console.log('   MONGO_URI:', process.env.MONGO_URI ? '✅ Loaded' : '❌ Not Found (Using localhost default)');
console.log('   EMAIL_USER:', process.env.EMAIL_USER ? '✅ Loaded' : '❌ Not Found');

console.log('📧 Applying Robust Email Configuration (Port 587)...');

// Initialize Razorpay
let razorpayInstance = null;
if (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('✅ Razorpay Payment Gateway initialized');
}

// Standard Nodemailer Transporter
// We use a standard configuration. If Gmail blocks Render, the logs will show it,
// and the app will fallback to printing the link in the console.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
  port: 587, // Force Port 587 (STARTTLS) - Most reliable for cloud
  secure: false, // Must be false for port 587
  pool: true, // Use connection pooling for better stability
  maxConnections: 2, // Limit concurrent connections to avoid rate limits
  auth: {
    user: (process.env.EMAIL_USER || '9e3686001@smtp-brevo.com').trim(),
    pass: (process.env.EMAIL_PASS || '').trim(),
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3' // Helps with handshake compatibility
  },
  family: 4, // Force IPv4
  connectionTimeout: 60000, // 60 seconds (Critical for timeouts)
  greetingTimeout: 30000,   // 30 seconds
  socketTimeout: 60000,     // 60 seconds
  logger: true, // Log to console for debugging
  debug: true   // Include debug info
});

// Verify connection configuration on startup
transporter.verify(function (error, success) {
  if (error) {
    console.warn('⚠️  Email service not configured correctly or blocked:', error.message);
  } else {
    console.log('✅ Email service is ready');
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html', 'htm'] }));

// DB Check Middleware
app.use('/api', (req, res, next) => {
  if (!db) {
    return res.status(503).json({ message: 'Database not connected. Please wait or check server logs.' });
  }
  next();
});

// Database Connection
let db;
const client = new MongoClient(MONGO_URI);

async function connectDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`✅ Connected to MongoDB`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    if (err.code === 'ENOTFOUND' && MONGO_URI.includes('cluster0.mongodb.net')) {
      console.error('\n⚠️  CONFIGURATION ERROR:');
      console.error('   You are using the default placeholder "cluster0.mongodb.net".');
      console.error(`   Please update your .env file at "${path.join(__dirname, '.env')}"`);
      console.error('   with your ACTUAL MongoDB Atlas connection string, or remove the line to use local MongoDB.\n');
    }
  }
}
connectDB();

// --- Helpers ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- Auth Routes ---

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      salary: 0,
      planData: null,
      categories: [], // Custom categories
      resetPasswordToken: null,
      resetPasswordExpires: null
    };

    const result = await db.collection('users').insertOne(newUser);
    const token = jwt.sign({ id: result.insertedId, email }, JWT_SECRET);

    res.status(201).json({ token, user: { id: result.insertedId, name, email } });
  } catch (e) {
    console.error('Signup Error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign In
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.collection('users').findOne({ email });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, email }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, preferences: user.preferences } });
  } catch (e) {
    console.error('Signin Error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Current User (Me)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    if (!user) return res.sendStatus(404);
    
    // Remove password from response
    const { password, ...userData } = user;
    res.json({ user: userData, salary: user.salary, planData: user.planData });
  } catch (e) {
    res.sendStatus(500);
  }
});

// Update Profile (Salary, Plan, Info)
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id; // Prevent ID update
    delete updates.password; // Prevent password update via this route

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: updates }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Update failed' });
  }
});

// Logout (Client-side mostly, but endpoint exists)
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// --- Forgot Password Routes ---

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await db.collection('users').findOne({ email });

    if (!user) {
      console.log(`ℹ️  Forgot Password: No user found with email ${email}`);
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If a user with that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { resetPasswordToken: token, resetPasswordExpires: expires } }
    );

    let resetURL;
    if (BASE_URL) {
      resetURL = `${BASE_URL}/reset-password.html?token=${token}`;
    } else {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host || 'localhost:5003';
      resetURL = `${protocol}://${host}/reset-password.html?token=${token}`;
    }

    // Log link for development/testing (in case email fails)
    console.log('\n==================================================');
    console.log(`👤 User Found: ${user.email} (ID: ${user._id})`);
    console.log('🔑 PASSWORD RESET LINK (Dev/Testing):');
    console.log(resetURL);
    console.log('==================================================\n');

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const senderEmail = process.env.EMAIL_SENDER || process.env.EMAIL_USER;
      const mailOptions = {
        to: user.email,
        from: `Expense Tracker <${senderEmail}>`,
        replyTo: senderEmail,
        subject: 'Reset Your Expense Tracker Password',
        text: `Hello ${user.name},\n\nYou requested a password reset. Please use the following link to reset your password:\n\n${resetURL}\n\nIf you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #3f67e6; text-align: center;">Password Reset Request</h2>
            <p style="color: #333; font-size: 16px;">Hello ${user.name},</p>
            <p style="color: #555; line-height: 1.5;">You are receiving this email because we received a password reset request for your account.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetURL}" style="background-color: #3f67e6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p style="color: #555; line-height: 1.5;">If you did not request a password reset, no further action is required.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetURL}" style="color: #3f67e6;">${resetURL}</a></p>
          </div>
        `
      };
      try {
        console.log(`📧 Sending email via ${process.env.EMAIL_HOST || 'Brevo'}...`);
        await transporter.sendMail(mailOptions);
        console.log(`✅ Password reset email sent to ${user.email}`);
      } catch (emailErr) {
        console.error('❌ Failed to send email (Network Blocked):', emailErr.message);
        console.log('💡 Use the link printed above to reset password manually.');
      }
    } else {
      console.warn('⚠️  Skipping email send because credentials are missing in environment variables.');
      console.warn(`   EMAIL_USER present: ${!!process.env.EMAIL_USER}`);
      console.warn(`   EMAIL_PASS present: ${!!process.env.EMAIL_PASS}`);
    }

    res.json({ message: 'If a user with that email exists, a reset link has been sent.' });
  } catch (e) {
    console.error('Forgot Password Error:', e);
    res.status(500).json({ message: `Server error: ${e.message}` });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required.' });
    }

    const user = await db.collection('users').findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword, resetPasswordToken: null, resetPasswordExpires: null } }
    );

    res.json({ message: 'Password has been reset successfully.' });
  } catch (e) {
    console.error('Reset Password Error:', e);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

// --- Expense Routes ---

app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    let query = db.collection('expenses')
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ date: -1 });

    // Only limit if not explicitly asking for all (for reports/charts)
    if (req.query.limit !== 'all') {
      query = query.limit(100); 
    }

    const expenses = await query.toArray();
    res.json(expenses);
  } catch (e) {
    console.error('Error fetching expenses:', e);
    res.status(500).json({ message: 'Error fetching expenses' });
  }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expense = {
      ...req.body,
      userId: new ObjectId(req.user.id),
      createdAt: new Date().toISOString()
    };
    const result = await db.collection('expenses').insertOne(expense);
    res.json({ ...expense, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: 'Error saving expense' });
  }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    await db.collection('expenses').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user.id)
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting expense' });
  }
});

// --- Goal Routes ---

app.get('/api/goals', authenticateToken, async (req, res) => {
  try {
    const goals = await db.collection('goals')
      .find({ userId: new ObjectId(req.user.id) })
      .toArray();
    res.json(goals);
  } catch (e) {
    res.status(500).json({ message: 'Error fetching goals' });
  }
});

app.post('/api/goals', authenticateToken, async (req, res) => {
  try {
    const goal = {
      ...req.body,
      userId: new ObjectId(req.user.id),
      createdAt: new Date().toISOString()
    };
    const result = await db.collection('goals').insertOne(goal);
    res.json({ ...goal, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: 'Error saving goal' });
  }
});

app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
  try {
    await db.collection('goals').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user.id)
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting goal' });
  }
});

// --- Settings / Categories Routes ---

app.get('/api/settings', authenticateToken, async (req, res) => {
  // Re-uses auth/me logic basically, but specific for settings page
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    res.json({
      salary: user.salary,
      planData: user.planData,
      categories: user.categories || [],
      preferences: user.preferences || {},
      favorites: user.favorites || { upi: [] },
      supportedLanguages: SUPPORTED_LANGUAGES
    });
  } catch (e) {
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

app.get('/api/settings/languages', (req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

app.get('/api/settings/categories', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    const defaultCategories = ['Food', 'Rent', 'Travel', 'Vehicle loan', 'Home loan', 'Education', 'Entertainment', 'Shopping', 'Utilities', 'Other'];
    const userCategories = user.categories || [];
    // Combine unique
    const allCategories = [...new Set([...defaultCategories, ...userCategories])];
    res.json({ categories: allCategories });
  } catch (e) {
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

app.post('/api/settings/categories', authenticateToken, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) return res.status(400).json({ message: 'Category required' });

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $addToSet: { categories: category } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error adding category' });
  }
});

app.delete('/api/settings/categories/:name', authenticateToken, async (req, res) => {
  try {
    const categoryName = req.params.name;
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $pull: { categories: categoryName } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting category' });
  }
});

app.put('/api/settings/favorites', authenticateToken, async (req, res) => {
  try {
    const { favorites } = req.body;
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: { favorites } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error updating favorites' });
  }
});

// --- Preferences Routes ---

app.get('/api/preferences', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    res.json(user.preferences || {});
  } catch (e) {
    res.status(500).json({ message: 'Error fetching preferences' });
  }
});

app.put('/api/preferences', authenticateToken, async (req, res) => {
  try {
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: { preferences: req.body } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error updating preferences' });
  }
});

// --- Notification Routes ---

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await db.collection('notifications')
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(notifications);
  } catch (e) {
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notification = {
      ...req.body,
      userId: new ObjectId(req.user.id),
      createdAt: new Date().toISOString(),
      read: false
    };
    const result = await db.collection('notifications').insertOne(notification);
    res.json({ ...notification, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: 'Error saving notification' });
  }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await db.collection('notifications').updateMany(
      { userId: new ObjectId(req.user.id) },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error marking all read' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.collection('notifications').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user.id) },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error marking read' });
  }
});

app.delete('/api/notifications', authenticateToken, async (req, res) => {
  try {
    await db.collection('notifications').deleteMany({ userId: new ObjectId(req.user.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting notifications' });
  }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
  try {
    await db.collection('notifications').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user.id)
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting notification' });
  }
});

// --- Moments Routes ---

app.get('/api/moments', authenticateToken, async (req, res) => {
  try {
    const moments = await db.collection('moments')
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(moments);
  } catch (e) {
    res.status(500).json({ message: 'Error fetching moments' });
  }
});

app.post('/api/moments', authenticateToken, async (req, res) => {
  try {
    // Check storage limit (Max 20 moments per user)
    const count = await db.collection('moments').countDocuments({ userId: new ObjectId(req.user.id) });
    if (count >= 20) {
      return res.status(400).json({ message: 'Storage limit reached. You can only store up to 20 moments.' });
    }

    const moment = {
      ...req.body,
      userId: new ObjectId(req.user.id),
      createdAt: new Date().toISOString()
    };
    const result = await db.collection('moments').insertOne(moment);
    res.json({ ...moment, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: 'Error saving moment' });
  }
});

app.delete('/api/moments', authenticateToken, async (req, res) => {
  try {
    await db.collection('moments').deleteMany({ userId: new ObjectId(req.user.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting all moments' });
  }
});

app.delete('/api/moments/:id', authenticateToken, async (req, res) => {
  try {
    await db.collection('moments').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user.id)
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting moment' });
  }
});

// --- Export Data Email Route ---
app.post('/api/user/export-email', authenticateToken, async (req, res) => {
  try {
    const { pdfData, htmlData, csvData } = req.body;
    const userId = new ObjectId(req.user.id);
    const user = await db.collection('users').findOne({ _id: userId });
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    let emailSent = false;

    // Attempt to send email if configured and user has email
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && user.email) {
      try {
        const senderEmail = process.env.EMAIL_SENDER || process.env.EMAIL_USER;
        const mailOptions = {
          to: user.email,
          from: `Expense Tracker <${senderEmail}>`,
          replyTo: senderEmail,
          subject: 'Your Expense Tracker Report',
          text: `Hello ${user.name},\n\nPlease find attached your comprehensive Expense Tracker report.\n\nBest regards,\nExpense Tracker Team`,
          html: htmlData || `Hello ${user.name},<br><br>Please find attached your comprehensive Expense Tracker report.<br><br>Best regards,<br>Expense Tracker Team`,
          attachments: []
        };

        if (pdfData) {
          console.log('📄 Processing PDF attachment...');
          const base64Content = pdfData.replace(/^data:application\/pdf;base64,/, "");
          mailOptions.attachments.push({
            filename: `FinFlow-Report-${new Date().toISOString().split('T')[0]}.pdf`,
            content: base64Content,
            encoding: 'base64'
          });
        }

        if (csvData) {
          mailOptions.attachments.push({
            filename: `FinFlow-Data-${new Date().toISOString().split('T')[0]}.csv`,
            content: csvData
          });
        }

        if (!pdfData && !csvData && !htmlData) {
          const expenses = await db.collection('expenses').find({ userId }).toArray();
          const goals = await db.collection('goals').find({ userId }).toArray();
          const exportData = { user, expenses, goals, date: new Date() };
          mailOptions.attachments.push({
            filename: `data-backup.json`,
            content: JSON.stringify(exportData, null, 2)
          });
        }

        await transporter.sendMail(mailOptions);
        console.log(`✅ Data export email sent to ${user.email}`);
        emailSent = true;
        return res.json({ success: true, message: 'Data sent to your email successfully.' });
      } catch (emailErr) {
        console.error('❌ Failed to send email (Network Blocked or Auth Error):', emailErr.message);
        console.log('💡 Falling back to direct download...');
      }
    } else {
      console.warn('⚠️  Email service not configured or user email missing. Falling back to direct download.');
    }

    // Fallback: Download directly if email failed or not configured
    if (!emailSent) {
      if (pdfData) {
        const base64Content = pdfData.replace(/^data:application\/pdf;base64,/, "");
        const buffer = Buffer.from(base64Content, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="FinFlow-Report-${new Date().toISOString().split('T')[0]}.pdf"`);
        console.log('⬇️  Fallback: Sending PDF directly to client...');
        return res.send(buffer);
      } else if (csvData) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="FinFlow-Data-${new Date().toISOString().split('T')[0]}.csv"`);
        console.log('⬇️  Fallback: Sending CSV directly to client...');
        return res.send(csvData);
      } else {
        // JSON Fallback
        const expenses = await db.collection('expenses').find({ userId }).toArray();
        const goals = await db.collection('goals').find({ userId }).toArray();
        const exportData = { user, expenses, goals, date: new Date() };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="data-backup.json"`);
        console.log('⬇️  Fallback: Sending JSON backup directly to client...');
        return res.send(JSON.stringify(exportData, null, 2));
      }
    }

  } catch (e) {
    console.error('Export Email Error:', e);
    res.status(500).json({ message: 'Error sending data email' });
  }
});

// --- PhonePe Routes ---
app.use('/api/payment', phonePeRoutes);

// --- Payment Routes (Razorpay) ---

app.get('/api/payment/key', authenticateToken, (req, res) => {
  if (!razorpayInstance) return res.status(503).json({ message: 'Payments not configured' });
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

app.post('/api/payment/create-order', authenticateToken, async (req, res) => {
  if (!razorpayInstance) return res.status(503).json({ message: 'Payments not configured' });
  
  try {
    const { amount, currency = 'INR' } = req.body;
    const options = {
      amount: Math.round(amount * 100), // amount in smallest currency unit (paise)
      currency,
      receipt: `receipt_${Date.now()}_${req.user.id.toString().substr(-4)}`
    };

    const order = await razorpayInstance.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Razorpay Error:', error);
    res.status(500).json({ message: 'Could not create payment order' });
  }
});

// --- Export Data Direct Download Route (Includes Moments) ---
app.get('/api/user/export-data', authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const user = await db.collection('users').findOne({ _id: userId });
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Gather all data including moments
    const expenses = await db.collection('expenses').find({ userId }).toArray();
    const goals = await db.collection('goals').find({ userId }).toArray();
    const notifications = await db.collection('notifications').find({ userId }).toArray();
    const moments = await db.collection('moments').find({ userId }).toArray();
    
    const exportData = {
      user: {
        name: user.name,
        email: user.email,
        salary: user.salary,
        planData: user.planData,
        categories: user.categories,
        preferences: user.preferences
      },
      expenses,
      goals,
      notifications,
      moments,
      exportDate: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=expense-tracker-data-${new Date().toISOString().split('T')[0]}.json`);
    res.json(exportData);
  } catch (e) {
    console.error('Export Data Error:', e);
    res.status(500).json({ message: 'Error exporting data' });
  }
});

// --- Reset Data Route ---
app.delete('/api/auth/reset-data', authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    await db.collection('expenses').deleteMany({ userId });
    await db.collection('goals').deleteMany({ userId });
    await db.collection('notifications').deleteMany({ userId });
    await db.collection('moments').deleteMany({ userId });
    
    // Reset user profile fields but keep account
    await db.collection('users').updateOne({ _id: userId }, {
      $set: { salary: 0, planData: null, categories: [], preferences: {} }
    });
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error resetting data' });
  }
});

// --- Catch-All Route (Fix for "Not Found" on refresh) ---
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
