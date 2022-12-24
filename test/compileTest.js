import { default as expect } from "expect.js";
import { newCompiler, parse } from "../src/index.js";
import { Runtime } from "@observablehq/runtime";

describe("compileModule", () => {
  it("should compile module cells", async () => {
    const cells = parse([
      `mutable myA = 'aa'`,
      `{ mutable myA = 'Hello, world!' }`,
    ]);
    const compile = newCompiler({
      resolve: () => {},
      runtime: new Runtime(),
      observer: () => true, // Just to be sure that all cells are evaluated
    });

    const compiled = await compile(cells);
    expect(typeof compiled).to.be("object");
    const value = await compiled.value("myA");
    expect(value).to.eql("Hello, world!");
  });

  it("should be able to re-define 'this' for cells", async () => {
    const cells = parse([
      `mycell = { return { message: "Hello", context : this } }`,
    ]);
    const compile = newCompiler({
      resolve: () => {},
      runtime: new Runtime(),
      observer: () => true, // Just to be sure that all cells are evaluated
    });

    const context = { message : "World" }
    const compiled = await compile(cells, ({ method, args }) => method.call(context, args));
    expect(typeof compiled).to.be("object");
    const value = await compiled.value("mycell");
    expect(value).to.eql({
      message: "Hello",
      context
    });
    expect(value.context).to.be(context);
  });

  it("in embedded functions 'this' should be undefined", async () => {
    const cells = parse([
      `mycell = { 
        return { context : this, xContext : x() }

        function x() {
          return this;
        }
      }`,
    ]);
    const compile = newCompiler({
      resolve: () => {},
      runtime: new Runtime(),
      observer: () => true, // Just to be sure that all cells are evaluated
    });

    const context = { message : "ABC" }
    const compiled = await compile(cells, ({ method, args }) => method.call(context, args));
    expect(typeof compiled).to.be("object");
    const value = await compiled.value("mycell");
    expect(value).to.eql({
      context,
      xContext : undefined
    });
    expect(value.context).to.be(context);
    expect(value.xContext).to.be(undefined);
  });
});
