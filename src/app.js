import express from 'express';
import dotenv from 'dotenv';
import bookingsRoutes from './routes/bookingsRoutes.js';
import cors from 'cors';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cors());
// Simple route
app.use('/api', bookingsRoutes);
app.get('/', (req, res) => {
  res.send('Hello from Express with TypeScript and Docker!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
