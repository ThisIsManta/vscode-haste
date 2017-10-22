import * as _ from 'lodash'
import { Language, Item } from './global'

export default class RecentSelectedItems {
	private data = new Map<string, Array<string>>()
	limit: number

	constructor(limit: number) {
		this.limit = limit
	}

	has(language: Language) {
		return this.data.has(language.constructor.name) && this.data.get(language.constructor.name).length > 0
	}

	sort(language: Language, items: Array<Item>) {
		if (this.has(language) === false) {
			return items
		}

		const list = this.data.get(language.constructor.name)
		const hash = list.reduce((hash, id, rank) => {
			hash[id] = rank
			return hash
		}, {})

		return _.sortBy(items, item => {
			const rank = hash[item.id]
			return rank === undefined ? Infinity : rank
		})
	}

	markAsRecentlyUsed(language: Language, selectedItem: Item) {
		if (this.data.has(language.constructor.name) === false) {
			this.data.set(language.constructor.name, [])
		}

		const list = this.data.get(language.constructor.name)
		if (list.indexOf(selectedItem.id) >= 0) {
			list.splice(list.indexOf(selectedItem.id), 1)
		}
		list.unshift(selectedItem.id)
		if (list.length > this.limit) {
			list.pop()
		}
	}

	fromJSON(json: any) {
		for (const languageName in json) {
			this.data.set(languageName, json[languageName] || [])
		}
	}

	toJSON() {
		const json = {}
		this.data.forEach((list, language) => {
			json[language] = list
		})
		return json
	}
}