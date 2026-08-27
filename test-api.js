async function test() {
  const res = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'genos-admin' })
  });
  const data = await res.json();
  console.log('Login:', data);

  const res2 = await fetch('http://localhost:4000/api/workspaces', {
    headers: { 'Authorization': 'Bearer ' + data.token }
  });
  const data2 = await res2.json();
  console.log('Workspaces count:', data2.length);
  if (data2.length === 0) console.log(data2);
}
test();
