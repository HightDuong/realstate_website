import mongoose from 'mongoose';

// MONGODB_DB_NAME chọn database trên cùng cluster (vd "realestate_dev" khi chạy local).
// Không đặt → dùng database trong MONGODB_URI (production hiện là "test").
export const getDbOptions = () =>
  process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, getDbOptions());
    console.log(`Connected to MongoDB (database: ${mongoose.connection.name})`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
};
export default connectDB;
