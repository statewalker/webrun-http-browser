import { default as expect } from 'expect.js';
// import { newHtmlParser } from '@dynotes/parser-html';
import { parse } from "../src/index.js";

import tests from './parseTest.data.js'

describe('parseObservableCell', () => {
  for (const test of tests) {
    it(test.message, () => {
      const cells = parse(test.source);
      try {
        expect(Array.isArray(cells)).to.be(true);
        expect(cells).to.eql(test.control);
      } catch (err) {
        console.log(JSON.stringify(cells, null, 2));
        throw err;
      }
    })
  }
})
