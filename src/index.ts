import express, { Request, Response } from 'express';
import getModelsHandler from './models';
import postCompletion from './completions';

const app: express.Application = express();

const port: number = process.env.PORT ? parseInt(process.env.PORT) : 9090;

app.use(express.json());

app.get('/v1/models', getModelsHandler);
app.post('/v1/chat/completions', postCompletion);

app.all('*', (req: Request, res: Response) => {
  console.log('Received request for an unimplemented endpoint:');
  console.log('Method:', req.method);
  console.log('Path:', req.originalUrl);
  console.log('Query Parameters:', req.query);
  console.log('Body:', req.body);

  res.status(501).json({ message: 'Endpoint not implemented' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Proxy is running at http://0.0.0.0:${port}/`);
});
