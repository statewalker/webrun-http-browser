export default [
  {
    message: "should parse cells with single variable references",
    source: `

myA


`,
    control: [
      {
        "type": "cell",
        "name": null,
        "references": [
          "myA",
        ],
        "code": "function (myA) {\nreturn (myA);\n}",
      },
    ],
  },

  {
    message: 'should parse "viewof" cells',
    source: `

viewof myA=html\`<input type="number" value="2">\`

`,
    control: [
      {
        "type": "cell",
        "name": "viewof myA",
        "references": [
          "html",
        ],
        "code":
          'function viewof_myA(html) {\nreturn (html`<input type="number" value="2">`);\n}',
      },
      {
        "type": "cell",
        "name": "myA",
        "references": [
          "Generators",
          "viewof myA",
        ],
        "code":
          "function value_myA(Generators, $) { return Generators.input($); }",
      },
    ],
  },
  {
    message: "should parse module cells with secrets",
    source: `

Secret('Foo Bar Baz')

`,
    control: [
      {
        "type": "cell",
        "name": null,
        "references": [
          "Secret",
        ],
        "code": "function (Secret) {\nreturn (Secret('Foo Bar Baz'));\n}",
        "constants": {
          "Secret": {
            "Foo Bar Baz": "Foo Bar Baz",
          },
        },
      },
    ],
  },

  {
    message: "should parse module cells with file attachments",
    source: `

FileAttachment('My File')
`,
    control: [
      {
        "type": "cell",
        "name": null,
        "references": [
          "FileAttachment",
        ],
        "code":
          "function (FileAttachment) {\nreturn (FileAttachment('My File'));\n}",
        "constants": {
          "FileAttachment": {
            "My File": "My File",
          },
        },
      },
    ],
  },

  {
    message: "should parse module cells with database references",
    source: `

DatabaseClient('testdb')
`,
    control: [
      {
        "type": "cell",
        "name": null,
        "references": [
          "DatabaseClient",
        ],
        "code":
          "function (DatabaseClient) {\nreturn (DatabaseClient('testdb'));\n}",
        "constants": {
          "DatabaseClient": {
            "testdb": "testdb",
          },
        },
      },
    ],
  },
  {
    message: `Should properly return async expressions`,
    source: `data=await FileAttachment('mydata.json').json()`,
    control: [
      {
        "type": "cell",
        "name": "data",
        "references": [
          "FileAttachment",
        ],
        "code":
          "async function data(FileAttachment) {\nreturn (await FileAttachment('mydata.json').json());\n}",
        "constants": {
          "FileAttachment": {
            "mydata.json": "mydata.json",
          },
        },
      },
    ],
  },
  {
    message: `Should properly return named block expressions`,
    source: `data={ yield 'ABC'; }`,
    control: [
      {
        "type": "cell",
        "name": "data",
        "references": [],
        "code": "function* data() { yield 'ABC'; }",
      },
    ],
  },
  {
    message: `Should properly return un-named block expressions`,
    source: `{ yield 'ABC'; }`,
    control: [
      {
        "type": "cell",
        "name": null,
        "references": [],
        "code": "function* () { yield 'ABC'; }",
      },
    ],
  },
  {
    message: `Should parse examples code`,
    source: [
      `message = "Hello, world!"`,
      `element = {
            const div = document.createElement("div");
            div.innerHTML = message;
            return div;
         }`,
    ],
    control: [
      {
        "code": 'function message() {\nreturn ("Hello, world!");\n}',
        "name": "message",
        "references": [],
        "type": "cell",
      },
      {
        "code":
          'function element(message) {\n            const div = document.createElement("div");\n            div.innerHTML = message;\n            return div;\n         }',
        "name": "element",
        "references": [
          "message",
        ],
        "type": "cell",
      },
    ],
  },
];
