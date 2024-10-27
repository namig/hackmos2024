import '@endo/init';
import { E } from '@endo/far';
// eslint-disable-next-line import/no-unresolved -- https://github.com/avajs/ava/issues/2951
import test from 'ava';
import { start } from '../src/tutorial/hello-world.js';

test('contract greets by name', async t => {
    const { publicFacet } = start();
    const actual = await E(publicFacet).greet('Bob');
    t.is(actual, 'Hello, Bob!');
});