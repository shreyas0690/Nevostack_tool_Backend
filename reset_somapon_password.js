const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { User } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0";

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

async function resetPassword(email, newPassword) {
  await connectDB();

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error('User not found for email:', email);
      process.exit(1);
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const hashed = await bcrypt.hash(newPassword, saltRounds);

    user.password = hashed;
    await user.save();

    console.log(`Password for ${email} has been updated successfully.`);
    process.exit(0);
  } catch (err) {
    console.error('Error updating password for', email, err);
    process.exit(1);
  }
}

// Update the email and password below as needed
const targetEmail = 'paapaji@gmail.com';
const newPassword = 'Agamon@123';

resetPassword(targetEmail, newPassword);


