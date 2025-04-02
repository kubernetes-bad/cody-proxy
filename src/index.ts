import express, { Request, Response } from 'express';
import getModelsHandler from './models';
import postCompletion from './completions';
import { asyncHandler, openAiErrorHandler } from './errorHandler';

const app: express.Application = express();

const port: number = process.env.PORT ? parseInt(process.env.PORT) : 9090;

app.use(express.json());

if (process.env.API_KEY) {
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['authorization'];
    if (apiKey && apiKey === `Bearer ${process.env.API_KEY}`) return next();
    console.log(`Unauthorized request to ${req.method} ${req.url} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    res.status(403).json({ error: 'Forbidden: Invalid API key' });
  });
} else console.log(`Warning: API key NOT set! Allowing everyone in!`);

app.get('/v1/models', getModelsHandler);
app.post('/v1/chat/completions', asyncHandler(postCompletion));

app.all('/{*splat}', (req: Request, res: Response) => {
  console.log('Received request for an unimplemented endpoint:');
  console.log('Method:', req.method);
  console.log('Path:', req.originalUrl);
  console.log('Query Parameters:', req.query);
  console.log('Body:', req.body);

  res.status(501).json({ message: 'Endpoint not implemented' });
});

app.use(openAiErrorHandler);

app.listen(port, '0.0.0.0', (err) => {
  if (err) throw err;
  console.log(`Proxy is running at http://0.0.0.0:${port}/`);
});
