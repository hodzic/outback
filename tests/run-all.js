// Usage: npm test            (all suites)
//        node tests/run-all.js edge   (suites whose file name contains "edge")
const fs = require('fs'), path = require('path');
const { serve, launch, check, results } = require('./harness');
(async () => {
  const filter = process.argv[2] || '';
  const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
  const srv = await serve(), browser = await launch();
  for (const f of suites){
    try{ await require(path.join(__dirname, f))(browser, srv.url, check); }
    catch(e){ check(f, 'suite crashed', false, e.message.split('\n')[0]); }
  }
  await browser.close(); srv.close();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.suite.padEnd(6)} ${r.name}${r.info && !r.ok ? '  — ' + r.info : ''}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
