import '@endo/init';
import {E} from '@endo/far';
// eslint-disable-next-line import/no-unresolved -- https://github.com/avajs/ava/issues/2951
import test from 'ava';
import * as access from '../src/tutorial/access.js';

test('access control', async t => {
    const {publicFacet, creatorFacet} = access.start();
    t.is(await E(publicFacet).get(), 'Hello, World!');
    await t.throwsAsync(E(publicFacet).set(2), {message: /no method/});
    await E(creatorFacet).set(2);
    t.is(await E(publicFacet).get(), 2);
});