import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
} from 'vscode-languageserver/node';
import {
  getCSSLanguageService,
  getSCSSLanguageService,
  getLESSLanguageService,
  CompletionItemKind,
  TextDocument,
  SymbolInformation
} from 'vscode-css-languageservice';
import { SymbolKind, } from 'vscode-languageserver-types';
import { VueParser } from './parser';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

const getLanguageService = (fileExtension: string) => {
  switch (fileExtension) {
    case '.less':
      return getLESSLanguageService;
    case '.scss':
      return getSCSSLanguageService;
    default:
      return getCSSLanguageService;
  }
};

let completionItems: CompletionItem[] = [];
const compItemMap = new Map<SymbolInformation['name'], CompletionItem>();


connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!capabilities.workspace?.configuration;
  hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;
  hasDiagnosticRelatedInformationCapability = !!capabilities.textDocument?.publishDiagnostics?.relatedInformation;

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true
      }
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }

  connection.console.log('#### onInitialize ####');
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
  connection.console.log('#### onInitialized ####');
});

interface Settings {
  maxNumberOfProblems: number;
}

const defaultSettings: Settings = { maxNumberOfProblems: 1000 };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <Settings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<Settings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'languageServerExample'
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
  connection.console.log('#### onDidClose ####');
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
  connection.console.log('#### onDidChangeContent ####');
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // Reset complitionItem array
  compItemMap.clear();
  completionItems.length = 0;

  const filename = textDocument.uri.split('/').pop() || '';
  const parser = new VueParser({ source: textDocument.getText(), filename });
  const styles = parser.getStyles() || [];

  // array of style tags `<style></style>`
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const isModule = !!style.module;
    if (!isModule) {
      continue;
    }

    const lang = style.lang || 'css';
    const languageService = getLanguageService(lang);
    const service = languageService();
    const document = TextDocument.create(textDocument.uri, lang, 0, style.content);
    const styleSheet = service.parseStylesheet(document);
    const documentSymbols = service.findDocumentSymbols(document, styleSheet);

    // array of class name of Id (ex. `.hello` or `#App` )
    for (let k = 0; k < documentSymbols.length; k++) {
      const sym = documentSymbols[k];
      const isClassSymbol = sym.kind === SymbolKind.Class;
      const className = sym.name.slice(0, 1) === '.' ? sym.name.slice(1) : null; // expected "." or "#"

      if (!isClassSymbol || !className) {
        continue;
      }

      const completionItem: CompletionItem = {
        label: className,
        kind: CompletionItemKind.Property,
      };

      if (!compItemMap.get(className)) {
        compItemMap.set(className, completionItem);
      }
    }

    completionItems = [...compItemMap.values()];
    connection.console.log(JSON.stringify(completionItems, null, '\t'));
  }
}

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VSCode
  connection.console.log('#### onDidChangeWatchedFiles ####');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    connection.console.log('#### onCompletion ####');
    return completionItems;
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.label === 'label') {
      item.detail = 'Hello CSS';
      item.documentation = 'Hello CSS documentation';
    } else if (item.label === 'world') {
      item.detail = 'World CSS';
      item.documentation = 'World CSS documentation';
    }
    connection.console.log('#### onCompletionResolve ####');
    return item;
  }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
