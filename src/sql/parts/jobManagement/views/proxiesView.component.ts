/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!sql/parts/grid/media/slickColorTheme';
import 'vs/css!sql/parts/grid/media/flexbox';
import 'vs/css!sql/parts/grid/media/styles';
import 'vs/css!sql/parts/grid/media/slick.grid';
import 'vs/css!sql/parts/grid/media/slickGrid';
import 'vs/css!../common/media/jobs';
import 'vs/css!sql/media/icons/common-icons';
import 'vs/css!sql/base/browser/ui/table/media/table';

import * as dom from 'vs/base/browser/dom';
import * as sqlops from 'sqlops';
import * as nls from 'vs/nls';
import { Component, Inject, forwardRef, ElementRef, ChangeDetectorRef, ViewChild, OnInit } from '@angular/core';
import { Table } from 'sql/base/browser/ui/table/table';
import { AgentViewComponent } from 'sql/parts/jobManagement/agent/agentView.component';
import { IJobManagementService } from 'sql/parts/jobManagement/common/interfaces';
import { EditProxyAction, DeleteProxyAction, NewProxyAction } from 'sql/parts/jobManagement/common/jobActions';
import { CommonServiceInterface } from 'sql/services/common/commonServiceInterface.service';
import { TabChild } from 'sql/base/browser/ui/panel/tab.component';
import { JobManagementView } from 'sql/parts/jobManagement/views/jobManagementView';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDashboardService } from 'sql/services/dashboard/common/dashboardService';
import { ProxiesCacheObject } from 'sql/parts/jobManagement/common/jobManagementService';
import { RowDetailView } from 'sql/base/browser/ui/table/plugins/rowdetailview';

export const VIEW_SELECTOR: string = 'jobproxiesview-component';
export const ROW_HEIGHT: number = 45;

@Component({
	selector: VIEW_SELECTOR,
	templateUrl: decodeURI(require.toUrl('./proxiesView.component.html')),
	providers: [{ provide: TabChild, useExisting: forwardRef(() => ProxiesViewComponent) }],
})

export class ProxiesViewComponent extends JobManagementView implements OnInit {

	private NewProxyText: string = nls.localize('jobProxyToolbar-NewItem', "New Proxy");
	private RefreshText: string = nls.localize('jobProxyToolbar-Refresh', "Refresh");

	private columns: Array<Slick.Column<any>> = [
		{
			name: nls.localize('jobProxiesView.accountName', 'Account Name'),
			field: 'accountName',
			formatter: (row, cell, value, columnDef, dataContext) => this.renderName(row, cell, value, columnDef, dataContext),
			width: 200,
			id: 'accountName'
		},
		{ name: nls.localize('jobProxiesView.credentialName', 'Credential Name'), field: 'credentialName', width: 200, id: 'credentialName' },
		{ name: nls.localize('jobProxiesView.description', 'Description'), field: 'description', width: 200, id: 'description'},
		{ name: nls.localize('jobProxiesView.isEnabled', 'Enabled'), field: 'isEnabled', width: 200, id: 'isEnabled'}
	];

	private options: Slick.GridOptions<any> = {
		syncColumnCellResize: true,
		enableColumnReorder: false,
		rowHeight: ROW_HEIGHT,
		enableCellNavigation: true,
		editable: false
	};

	private dataView: any;
	private _serverName: string;
	private _isCloud: boolean;
	private _proxiesCacheObject: ProxiesCacheObject;

	public proxies: sqlops.AgentProxyInfo[];
	public readonly contextAction = NewProxyAction;

	@ViewChild('proxiesgrid') _gridEl: ElementRef;

	constructor(
		@Inject(forwardRef(() => ChangeDetectorRef)) private _cd: ChangeDetectorRef,
		@Inject(forwardRef(() => ElementRef)) private _el: ElementRef,
		@Inject(forwardRef(() => AgentViewComponent)) private _agentViewComponent: AgentViewComponent,
		@Inject(IJobManagementService) private _jobManagementService: IJobManagementService,
		@Inject(ICommandService) private _commandService: ICommandService,
		@Inject(IInstantiationService) instantiationService: IInstantiationService,
		@Inject(forwardRef(() => CommonServiceInterface)) commonService: CommonServiceInterface,
		@Inject(IContextMenuService) contextMenuService: IContextMenuService,
		@Inject(IKeybindingService)  keybindingService: IKeybindingService,
		@Inject(IDashboardService) _dashboardService: IDashboardService
	) {
		super(commonService, _dashboardService, contextMenuService, keybindingService, instantiationService);
		this._isCloud = commonService.connectionManagementService.connectionInfo.serverInfo.isCloud;
		let proxiesCacheObjectMap = this._jobManagementService.proxiesCacheObjectMap;
		let proxiesCacheObject = proxiesCacheObjectMap[this._serverName];
		if (proxiesCacheObject) {
			this._proxiesCacheObject = proxiesCacheObject;
		} else {
			this._proxiesCacheObject = new ProxiesCacheObject();
			this._proxiesCacheObject.serverName = this._serverName;
			this._jobManagementService.addToCache(this._serverName, this._proxiesCacheObject);
		}
	}

	ngOnInit(){
		// set base class elements
		this._visibilityElement = this._gridEl;
		this._parentComponent = this._agentViewComponent;
	}

	public layout() {
		let height = dom.getContentHeight(this._gridEl.nativeElement) - 10;
		if (height < 0) {
			height = 0;
		}

		if (this._table) {
			this._table.layout(new dom.Dimension(
				dom.getContentWidth(this._gridEl.nativeElement),
				height));
		}
	}

	onFirstVisible() {
		let self = this;
		let cached: boolean = false;
		if (this._proxiesCacheObject.serverName === this._serverName) {
			if (this._proxiesCacheObject.proxies && this._proxiesCacheObject.proxies.length > 0) {
				cached = true;
				this.proxies = this._proxiesCacheObject.proxies;
			}
		}

		let columns = this.columns.map((column) => {
			column.rerenderOnResize = true;
			return column;
		});

		this.dataView = new Slick.Data.DataView({ inlineFilters: false });
		let rowDetail = new RowDetailView({
			cssClass: '_detail_selector',
			useRowClick: false,
			panelRows: 1
		});
		columns.unshift(rowDetail.getColumnDefinition());

		$(this._gridEl.nativeElement).empty();
		$(this.actionBarContainer.nativeElement).empty();
		this.initActionBar();
		this._table = new Table(this._gridEl.nativeElement, {columns}, this.options);
		this._table.grid.setData(this.dataView, true);

		this._register(this._table.onContextMenu(e => {
			self.openContextMenu(e);
		}));

		// checked for cached state
		if (cached && this._agentViewComponent.refresh !== true) {
			self.onProxiesAvailable(this.proxies);
			this._showProgressWheel = false;
			if (this.isVisible) {
				this._cd.detectChanges();
			}
		} else {
			let ownerUri: string = this._commonService.connectionManagementService.connectionInfo.ownerUri;
			this._jobManagementService.getProxies(ownerUri).then((result) => {
				if (result && result.proxies) {
					self.proxies = result.proxies;
					self._proxiesCacheObject.proxies = result.proxies;
					self.onProxiesAvailable(result.proxies);
				} else {
					// TODO: handle error
				}
				this._showProgressWheel = false;
				if (this.isVisible) {
					this._cd.detectChanges();
				}
			});
		}
	}

	private onProxiesAvailable(proxies: sqlops.AgentProxyInfo[]) {
		let items: any = proxies.map((item) => {
			return {
				id: item.accountName,
				accountName: item.accountName,
				credentialName: item.credentialName,
				description: item.description,
				isEnabled: item.isEnabled
			};
		});

		this.dataView.beginUpdate();
		this.dataView.setItems(items);
		this.dataView.endUpdate();
		this._proxiesCacheObject.dataview = this.dataView;
		this._table.autosizeColumns();
		this._table.resizeCanvas();
	}

	protected getTableActions(): TPromise<IAction[]> {
		let actions: IAction[] = [];
		actions.push(this._instantiationService.createInstance(EditProxyAction));
		actions.push(this._instantiationService.createInstance(DeleteProxyAction));
		return TPromise.as(actions);
	}

	protected getCurrentTableObject(rowIndex: number): any {
		return (this.proxies && this.proxies.length >= rowIndex)
			? this.proxies[rowIndex]
			: undefined;
	}

	private renderName(row, cell, value, columnDef, dataContext) {
		let resultIndicatorClass = dataContext.isEnabled ? 'proxyview-proxynameindicatorenabled' :
			'proxyview-proxynameindicatordisabled';
 		return '<table class="proxyview-proxynametable"><tr class="proxyview-proxynamerow">' +
			'<td nowrap class=' + resultIndicatorClass + '></td>' +
			'<td nowrap class="proxyview-proxynametext">' + dataContext.accountName + '</td>' +
			'</tr></table>';
	}

	public openCreateProxyDialog() {
		let ownerUri: string = this._commonService.connectionManagementService.connectionInfo.ownerUri;
		this._jobManagementService.getCredentials(ownerUri).then((result) => {
			if (result && result.credentials) {
				this._commandService.executeCommand('agent.openProxyDialog', ownerUri, undefined, result.credentials);
			}
		});
	}

	private refreshJobs() {
		this._agentViewComponent.refresh = true;
	}
}