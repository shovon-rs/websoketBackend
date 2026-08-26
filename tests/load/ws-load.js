import ws from 'k6/ws';
import { check } from 'k6';

export const options = { vus: 500, duration: '60s' };

export default function () {
  const url = `wss://${__ENV.HOST ?? 'localhost:3000'}/ws?token=${__ENV.LOAD_TEST_TOKEN}`;

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'dashboard:join',
          eventId: `${__VU}-${__ITER}`,
          timestamp: new Date().toISOString(),
          payload: {},
        }),
      );
    });

    socket.on('message', (data) => {
      check(JSON.parse(data), { 'has type': (e) => !!e.type });
    });

    socket.setTimeout(() => socket.close(), 50000);
  });

  check(res, { 'status was 101': (r) => r && r.status === 101 });
}
