import * as _ from 'lodash'
import * as vscode from 'vscode'

import { Configurations, Language, Item } from './global'
import LocalStorage from './LocalStorage'
import JavaScript from './JavaScript'
import TypeScript from './TypeScript'
import Stylus from './Stylus'

let languages: Array<Language>
let fileWatch: vscode.FileSystemWatcher
let localStorage = new LocalStorage()

export function activate(context: vscode.ExtensionContext) {
    fileWatch = vscode.workspace.createFileSystemWatcher('**/*')
    fileWatch.onDidCreate(e => {
        languages.forEach(language => {
            language.addItem ? language.addItem(e.fsPath) : language.reset()
        })
    })
    fileWatch.onDidDelete(e => {
        languages.forEach(language => {
            language.cutItem ? language.cutItem(e.fsPath) : language.reset()
        })
    })

    let config: Configurations
    function initialize() {
        config = vscode.workspace.getConfiguration().get<Configurations>('codeQuicken')

        localStorage.load(config)

        if (languages) {
            languages.forEach(language => language.reset())
        }

        languages = [
            // Add new supported languages here
            new TypeScript(config, fileWatch),
            new JavaScript(config, fileWatch),
            new Stylus(config),
        ]
    }
    initialize()
    vscode.workspace.onDidChangeConfiguration(initialize)

    context.subscriptions.push(vscode.commands.registerCommand('codeQuicken.addImport', async function () {
        const editor = vscode.window.activeTextEditor
        const document = editor && editor.document

        // Stop processing if the VS Code is not working with folder, or the current document is untitled
        if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
            return null
        }

        // Show the progress bar if the operation takes too long
        let progressWillShow = true
        let hideProgress = () => { progressWillShow = false }
        setTimeout(() => {
            if (!progressWillShow) {
                return
            }
            vscode.window.withProgress({ title: 'Populating Files...', location: vscode.ProgressLocation.Window }, async () => {
                await new Promise(resolve => {
                    hideProgress = resolve
                })
            })
        }, 150)

        for (let language of languages) {
            const items = await language.getItems(document)
            if (!items) {
                continue
            }

            // Stop processing if the active editor has been changed
            if (editor !== vscode.window.activeTextEditor) {
                hideProgress()
                return null
            }

            const { shortItems, totalItems } = items
            const recentItems = localStorage.recentSelectedItems.get(language, totalItems)
            const quickItems = _.unionBy(recentItems, shortItems, item => item.id)

            hideProgress()

            const picker = vscode.window.createQuickPick<Item>()
            picker.placeholder = 'Type a file path or node module name'
            picker.items = quickItems
            picker.matchOnDescription = true
            picker.onDidChangeValue(() => {
                if (picker.value.length > 0 && picker.items !== totalItems) {
                    picker.items = totalItems
                }

                if (picker.value.length === 0 && picker.items !== quickItems) {
                    picker.items = quickItems
                }
            })
            picker.onDidAccept(async () => {
                picker.hide()

                const [selectedItem] = picker.selectedItems
                if (!selectedItem) {
                    return null
                }

                localStorage.recentSelectedItems.markAsRecentlyUsed(language, selectedItem)

                // Insert the snippet
                await selectedItem.addImport(editor)

                picker.dispose()
            })
            picker.show()

            break
        }

        hideProgress()
    }))

    context.subscriptions.push(vscode.commands.registerCommand('codeQuicken.fixImport', async () => {
        const editor = vscode.window.activeTextEditor
        const document = editor.document

        // Stop processing if the VS Code is not working with folder, or the current document is untitled
        if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
            return null
        }

        const cancellationEvent = new vscode.CancellationTokenSource()
        const editorChangeEvent = vscode.window.onDidChangeActiveTextEditor(() => {
            cancellationEvent.cancel()
        })
        const documentCloseEvent = vscode.workspace.onDidCloseTextDocument((closingDocument) => {
            if (document === closingDocument) {
                cancellationEvent.cancel()
            }
        })

        await vscode.window.withProgress({ title: 'Code Quicken: Fixing invalid import/require statements', location: vscode.ProgressLocation.Window }, async () => {
            for (let lang of languages) {
                if (lang.fixImport === undefined) {
                    continue
                }

                const workingDocumentHasBeenFixed = await lang.fixImport(editor, document, cancellationEvent.token)

                // Stop processing if it is handled or cancelled
                if (workingDocumentHasBeenFixed === true || workingDocumentHasBeenFixed === null) {
                    return null
                }
            }

            // Show the error message if no languages can fix the imports
            vscode.window.showErrorMessage('Code Quicken: The current language was not supported.')
        })

        editorChangeEvent.dispose()
        documentCloseEvent.dispose()
        cancellationEvent.dispose()
    }))

    context.subscriptions.push(vscode.commands.registerCommand('codeQuicken.convertImport', async () => {
        const editor = vscode.window.activeTextEditor

        if (editor === undefined) {
            return null
        }

        for (const language of languages) {
            if (language.convertImport && await language.convertImport(editor)) {
                return null
            }
        }
    }))
}

export function deactivate() {
    languages.forEach(language => language.reset())
    fileWatch.dispose()

    localStorage.save()
}
