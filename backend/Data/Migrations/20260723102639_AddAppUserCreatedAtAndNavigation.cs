using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAppUserCreatedAtAndNavigation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "AppUserId",
                table: "UserOrganizations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserOrganizations_AppUserId",
                table: "UserOrganizations",
                column: "AppUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_UserOrganizations_users_AppUserId",
                table: "UserOrganizations",
                column: "AppUserId",
                principalTable: "users",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UserOrganizations_users_AppUserId",
                table: "UserOrganizations");

            migrationBuilder.DropIndex(
                name: "IX_UserOrganizations_AppUserId",
                table: "UserOrganizations");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "users");

            migrationBuilder.DropColumn(
                name: "AppUserId",
                table: "UserOrganizations");
        }
    }
}
