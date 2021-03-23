import { tailUntil } from '../../lib/tail-until.js';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';

chai.should();
chai.use(chaiAsPromised);

describe('tail-until', function () {

  it('rejects when timeout is hit', async function () {
    this.timeout(10 * 1000);
    await tailUntil(path.resolve('.', 'tail-until-specs.js'), 'foo', 500).should.be.rejectedWith('failed');
  });

});
