import { dv } from 'data-view';
import { App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';


interface NoteTimeTrackerSettings {
	maxTimeLimit: number;
}

const DEFAULT_SETTINGS: NoteTimeTrackerSettings = {
	maxTimeLimit: 3
}

class NoteTimeView {
	start: string;
	finish: string;
	totalTime: string;
	sessionStartTime: string;

	initialize(page: Record<string, any>): this {
		this.start = page.start;
		this.finish = page.finish;
		this.totalTime = !!page.totalTime ? page.totalTime.replace("`", "") : page.totalTime;
		this.sessionStartTime = page.sessionStartTime;
		return this;
	}

	toNoteTime(): NoteTime {
		let ret = new NoteTime();
		ret.start = !!this.start ? new Date (this.start) : null;
		ret.finish = !!this.finish ? new Date (this.finish) : null;
		ret.totalTime = (!!this.totalTime && this.totalTime.trim() != "") ? parseDurationString(this.totalTime) : 0;
		ret.sessionStartTime = !!this.sessionStartTime ? new Date(`${(new Date).toLocaleString().split(", ")[0]} ${this.sessionStartTime}`) : null;
		return ret;
	}
}

class NoteTime {
	start: Date | null;
	finish: Date | null;
	totalTime: number;
	sessionStartTime: Date | null;

	toView(): NoteTimeView {
		let ret = new NoteTimeView();
		ret.start = !!this.start ? this.start.toLocaleDateString() : "";
		ret.finish = !!this.finish ? this.finish.toLocaleDateString() : "";
		ret.totalTime = this.totalTime != null ? `\`${convertMilliSecondsToTimeString(this.totalTime)}\`` : "";
		ret.sessionStartTime = !!this.sessionStartTime ? this.sessionStartTime.toLocaleTimeString() : "";
		return ret;
	}
}

export default class NoteTimeTrackerPlugin extends Plugin {
	settings: NoteTimeTrackerSettings;
	loadSettings = async() => this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	saveSettings = async() => await this.saveData(this.settings);

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SettingTab(this.app, this));

		this.addCommand({ id: 'start-finish-note-tracking', name: 'Start/Finish Note Tracking', editorCallback: (editor: Editor) => startFinishNoteTracking(this.settings, editor) });
		this.addCommand({ id: 'start-end-note-session-tracking', name: 'Start/End Note Session Tracking', editorCallback: (editor: Editor) => startEndNoteSession(this.settings, editor) });
	}

}


/*
	- if startDate == null, sets the startDate to now
	- else, 
		- if sessionStartTime != null and calculatedSessionTime < maxTimeLimit , totalTime += calculatedSessionTime
		- sets finishDate to now
*/
const startFinishNoteTracking = async(settings: NoteTimeTrackerSettings, editor: Editor) =>  {
	const noteTime = await getCurrentPageNoteTime();
	// start tracking	
	if (!noteTime.start) {
		noteTime.start = new Date();
	} else { 	// finish tracking
		// add any oustanding time to totalTime
		const currentSessoinTime = calculatedSessionTime(noteTime)
		if (currentSessoinTime < getMaxTimeLimitAsMS(settings)) {
			noteTime.totalTime += currentSessoinTime;
		}
		noteTime.finish = new Date();
		noteTime.sessionStartTime = null;
	}
	await saveNoteTimeState(noteTime, editor);
}

/*
	- if startDate == null or finishDate != null, do nothing
	- else if sessionStartTime == null,  sessionStartTime = now
	- else if calculatedSessionTime > maxTimeLimit,  sessionStartTime = now
	- else
		- totalTime +=  calculatedSessionTime
		- delete  sessionStartTime
*/
const startEndNoteSession = async(settings: NoteTimeTrackerSettings, editor: Editor) =>  {
	const noteTime = await getCurrentPageNoteTime();
	if (!noteTime.start || !!noteTime.finish) {
		console.log("can't start a session if the note tracking hasn't started or has finished");
	} else if (noteTime.sessionStartTime == null) {
		noteTime.sessionStartTime = new Date();
	} else if (calculatedSessionTime(noteTime) > getMaxTimeLimitAsMS(settings)) {
		noteTime.sessionStartTime = new Date();
	} else {
		noteTime.totalTime += calculatedSessionTime(noteTime);
		noteTime.sessionStartTime = null;
	}
	await saveNoteTimeState(noteTime, editor);
}


const calculatedSessionTime = (noteTime: NoteTime): number => {
	return !!noteTime.sessionStartTime ? Date.now() - noteTime.sessionStartTime.getTime() : 0;
}

const getMaxTimeLimitAsMS = (settings: NoteTimeTrackerSettings)  => settings.maxTimeLimit * 1000 * 60 * 60;

const getCurrentPageNoteTime = async(): Promise<NoteTime> =>  {
	const file = app.workspace.getActiveFile();
	if (!file) throw new Error("no file active");
	const page = (await dv()).page(file.path);
	if (!page) throw new Error("dataview couldn't pull file");
	const view = new NoteTimeView().initialize(page);
	return view.toNoteTime();
}

/*
	for each property in notTime, find it's location in the file and save over the value 
	- will always be the first 4 lines of the file
*/
const saveNoteTimeState = async(noteTime: NoteTime, editor: Editor) => {
	const view = noteTime.toView();
	Object.keys(view).forEach((prop, idx) => {
		const value = (view as any)[prop];
		const line = getPropertyLine(editor, prop);
		// if (!line) throw new Error(`property ${prop} not found in file`); {}
		if (!!line) {
			editor.setLine(line.num, `${prop}::${value}`);
		} else {
			const currentText = editor.getLine(idx);
			editor.setLine(idx, `${prop}::${value}\n${currentText}`);
		}
	});
}

const getPropertyLine = (editor: Editor, propertyName: string): {num: number, text: string}  | null => {
    const content = editor.getDoc().getValue();
    const lines = content.split("\n");
    const num = lines.findIndex((text) => text.startsWith(`${propertyName}::`));
	if (num === -1) return null;
    return {
		num,
		text: lines[num]
	};
}

// created by ChatGPT4
const convertMilliSecondsToTimeString = (ms: number): string => {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	
	const secondsRemainder = seconds % 60;
	const minutesRemainder = minutes % 60;
	const hoursRemainder = hours % 24;
	
	const daysString = days > 0 ? `${days} day${days > 1 ? 's' : ''}, ` : '';
	const hoursString = hoursRemainder > 0 ? `${hoursRemainder} hour${hoursRemainder > 1 ? 's' : ''}, ` : '';
	const minutesString = minutesRemainder > 0 ? `${minutesRemainder} minute${minutesRemainder > 1 ? 's' : ''}, ` : '';
	const secondsString = secondsRemainder > 0 ? `${secondsRemainder} second${secondsRemainder > 1 ? 's' : ''}` : '';
	
	return daysString + hoursString + minutesString + secondsString;
}

function parseDurationString(readableDuration: string) {
	const parts = readableDuration.split(', ');
	let days = 0;
	let hours = 0;
	let minutes = 0;
	let seconds = 0;
	for (const part of parts) {
	  const [value, unit] = part.split(' ');
	  if (unit.includes('day')) {
		days = parseInt(value);
	  } else if (unit.includes('hour')) {
		hours = parseInt(value);
	  } else if (unit.includes('minute')) {
		minutes = parseInt(value);
	  } else if (unit.includes('second')) {
		seconds = parseInt(value);
	  }
	}
	// chatGPT-4 missed the paranthesis around seconds
	return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  }


class SettingTab extends PluginSettingTab {
	plugin: NoteTimeTrackerPlugin;

	constructor(app: App, plugin: NoteTimeTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Settings for note time tracking plugin'});
		new Setting(containerEl)
			.setName('Max Time Limit')
			.setDesc('The session will start over when session tries to end a session that is over the `Max Time Limit`')
			.addText(text => text
				.setPlaceholder('Enter `Max Time Limit` in hours')
				.setValue(this.plugin.settings.maxTimeLimit.toString())
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.maxTimeLimit = parseInt(value);
					await this.plugin.saveSettings();
				}));
	}
}
